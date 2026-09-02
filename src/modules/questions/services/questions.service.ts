import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CreateQuestionDto } from '../dto/create-question.dto';
import { UpdateQuestionDto } from '../dto/update-question.dto';
import { QuestionType, Difficulty } from '../../../generated/prisma/client';
import { normalizeShortText } from '../../attempts/utils/text-answer.util';

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async createQuestion(data: CreateQuestionDto) {
    if (data.quizIds && data.quizIds.length > 0) {
      const quizzes = await this.prisma.quiz.findMany({
        where: { id: { in: data.quizIds } }
      });

      if (quizzes.length !== data.quizIds.length) {
        throw new BadRequestException('One or more quizzes not found');
      }

      const nonDraftQuiz = quizzes.find(q => q.status !== 'DRAFT');
      if (nonDraftQuiz) {
        throw new ForbiddenException(`Cannot modify questions of a ${nonDraftQuiz.status.toLowerCase()} quiz`);
      }
    }

    if (data.type === QuestionType.TRUE_FALSE) {
      data.options = ['True', 'False'];
      if (data.correctAnswer !== 'True' && data.correctAnswer !== 'False') {
        throw new BadRequestException('correctAnswer must be "True" or "False" for TRUE_FALSE questions');
      }
    } else if (data.type === QuestionType.MCQ) {
      if (!Array.isArray(data.options) || data.options.length < 2) {
        throw new BadRequestException('MCQ must have at least 2 options');
      }
      const uniqueOptions = new Set(data.options);
      if (uniqueOptions.size !== data.options.length) {
        throw new BadRequestException('MCQ options must be unique');
      }
      if (!data.correctAnswer || !data.options.includes(data.correctAnswer)) {
        throw new BadRequestException('correctAnswer must be one of the provided options for MCQ questions');
      }
    }

    let correctAnswer = data.correctAnswer ?? '';
    if (data.type === QuestionType.SHORT_TEXT) {
      if (!correctAnswer.trim()) {
        throw new BadRequestException('correctAnswer must be a non-empty string for SHORT_TEXT questions');
      }
      correctAnswer = normalizeShortText(correctAnswer);
    }

    const question = await this.prisma.question.create({
      data: {
        type: data.type,
        text: data.text,
        options: data.options || [],
        correctAnswer,
        points: data.points ?? 1,
        difficulty: data.difficulty ?? Difficulty.MEDIUM,
        topic: data.topic,
        tags: data.tags ?? [],
        quizQuestions: data.quizIds?.length ? {
          create: data.quizIds.map((quizId, index) => ({
            quizId,
            order: index
          }))
        } : undefined
      },
      include: {
        quizQuestions: {
          include: {
            quiz: true
          }
        }
      }
    });
    return this.mapQuestionResponse(question);
  }

  async updateQuestion(id: string, data: UpdateQuestionDto) {
    const question = await this.prisma.question.findUnique({ 
      where: { id },
      include: { quizQuestions: { include: { quiz: true } } }
    });
    if (!question) {
      throw new NotFoundException('Question not found');
    }

    const attemptAnswerCount = await this.prisma.attemptAnswer.count({ where: { questionId: id } });
    if (attemptAnswerCount > 0) {
      throw new ForbiddenException('Cannot modify a question that has already been answered in an attempt');
    }

    const nonDraftQuiz = question.quizQuestions.find(qq => qq.quiz.status !== 'DRAFT');
    if (nonDraftQuiz) {
      throw new ForbiddenException(`Cannot modify questions of a ${nonDraftQuiz.quiz.status.toLowerCase()} quiz`);
    }

    const merged = {
      type: data.type ?? question.type,
      text: data.text ?? question.text,
      options: data.options ?? question.options,
      correctAnswer: data.correctAnswer ?? question.correctAnswer,
    };

    if (merged.type === QuestionType.TRUE_FALSE) {
      merged.options = ['True', 'False'];
      if (merged.correctAnswer !== 'True' && merged.correctAnswer !== 'False') {
        throw new BadRequestException('correctAnswer must be "True" or "False" for TRUE_FALSE questions');
      }
    } else if (merged.type === QuestionType.MCQ) {
      if (!Array.isArray(merged.options) || merged.options.length < 2) {
        throw new BadRequestException('MCQ must have at least 2 options');
      }
      const uniqueOptions = new Set(merged.options);
      if (uniqueOptions.size !== merged.options.length) {
        throw new BadRequestException('MCQ options must be unique');
      }
      if (!merged.options.includes(merged.correctAnswer)) {
        throw new BadRequestException('correctAnswer must be one of the provided options for MCQ questions');
      }
    } else if (merged.type === QuestionType.SHORT_TEXT) {
      if (!merged.correctAnswer.trim()) {
        throw new BadRequestException('correctAnswer must be a non-empty string for SHORT_TEXT questions');
      }
      merged.correctAnswer = normalizeShortText(merged.correctAnswer);
    }

    const updated = await this.prisma.question.update({
      where: { id },
      data: {
        type: data.type,
        text: data.text,
        options: data.options,
        correctAnswer:
          data.correctAnswer !== undefined || data.type !== undefined
            ? merged.correctAnswer
            : undefined,
        points: data.points,
        difficulty: data.difficulty,
        topic: data.topic,
        tags: data.tags,
      },
      include: {
        quizQuestions: {
          include: {
            quiz: true
          }
        }
      }
    });

    return this.mapQuestionResponse(updated);
  }

  async deleteQuestion(id: string) {
    const question = await this.prisma.question.findUnique({ 
      where: { id },
      include: { quizQuestions: { include: { quiz: true } } }
    });
    if (!question) {
      throw new NotFoundException('Question not found');
    }

    const attemptAnswerCount = await this.prisma.attemptAnswer.count({ where: { questionId: id } });
    if (attemptAnswerCount > 0) {
      throw new ForbiddenException('Cannot delete a question that has already been answered in an attempt');
    }

    const nonDraftQuiz = question.quizQuestions.find(qq => qq.quiz.status !== 'DRAFT');
    if (nonDraftQuiz) {
      throw new ForbiddenException(`Cannot modify questions of a ${nonDraftQuiz.quiz.status.toLowerCase()} quiz`);
    }

    await this.prisma.question.delete({ where: { id } });
    return this.mapQuestionResponse(question);
  }

  async getQuestion(id: string) {
    const question = await this.prisma.question.findUnique({ 
      where: { id },
      include: {
        quizQuestions: {
          include: {
            quiz: true
          }
        }
      }
    });
    if (!question) {
      throw new NotFoundException('Question not found');
    }
    return this.mapQuestionResponse(question);
  }

  async getQuestions(filter?: { type?: QuestionType; difficulty?: Difficulty; topic?: string; tags?: string[] }) {
    const where: any = {};
    if (filter?.type) {
      where.type = filter.type;
    }
    if (filter?.difficulty) {
      where.difficulty = filter.difficulty;
    }
    if (filter?.topic) {
      where.topic = filter.topic;
    }
    if (filter?.tags && filter.tags.length > 0) {
      where.tags = { hasSome: filter.tags };
    }

    const questions = await this.prisma.question.findMany({
      where,
      include: {
        quizQuestions: {
          include: {
            quiz: true
          }
        }
      }
    });
    return questions.map(q => this.mapQuestionResponse(q));
  }

  async findAllUnassigned(filter?: { type?: QuestionType; difficulty?: Difficulty; topic?: string; tags?: string[] }) {
    const where: any = {
      quizQuestions: {
        none: {}
      }
    };
    
    if (filter?.type) {
      where.type = filter.type;
    }
    if (filter?.difficulty) {
      where.difficulty = filter.difficulty;
    }
    if (filter?.topic) {
      where.topic = filter.topic;
    }
    if (filter?.tags && filter.tags.length > 0) {
      where.tags = { hasSome: filter.tags };
    }

    const questions = await this.prisma.question.findMany({
      where,
      include: {
        quizQuestions: {
          include: {
            quiz: true
          }
        }
      }
    });
    return questions.map(q => this.mapQuestionResponse(q));
  }

  async findByQuiz(quizId: string, filter?: { type?: QuestionType; difficulty?: Difficulty; topic?: string; tags?: string[] }) {
    const where: any = {
      quizQuestions: {
        some: { quizId }
      }
    };
    
    if (filter?.type) {
      where.type = filter.type;
    }
    if (filter?.difficulty) {
      where.difficulty = filter.difficulty;
    }
    if (filter?.topic) {
      where.topic = filter.topic;
    }
    if (filter?.tags && filter.tags.length > 0) {
      where.tags = { hasSome: filter.tags };
    }

    const questions = await this.prisma.question.findMany({
      where,
      include: {
        quizQuestions: {
          include: {
            quiz: true
          }
        }
      }
    });
    return questions.map(q => this.mapQuestionResponse(q));
  }

  async validateQuizHasQuestions(quizId: string): Promise<boolean> {
    const count = await this.prisma.quizQuestion.count({ where: { quizId } });
    return count > 0;
  }

  async assertQuestionsExist(ids: string[]): Promise<void> {
    const questions = await this.prisma.question.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    if (questions.length !== ids.length) {
      throw new BadRequestException('One or more questions not found');
    }
  }

  private mapQuestionResponse(question: any) {
    const { quizQuestions, ...rest } = question;
    return {
      ...rest,
      quizzes: (quizQuestions || []).map((qq: any) => qq.quiz)
    };
  }
}
