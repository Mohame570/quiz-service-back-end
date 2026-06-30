import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CreateQuestionDto } from '../dto/create-question.dto';
import { UpdateQuestionDto } from '../dto/update-question.dto';
import { QuestionType } from '../../../generated/prisma/client';

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

      const publishedQuiz = quizzes.find(q => q.status === 'PUBLISHED');
      if (publishedQuiz) {
        throw new ForbiddenException('Cannot modify questions of a published quiz');
      }
    }

    const question = await this.prisma.question.create({
      data: {
        type: data.type,
        text: data.text,
        options: data.options || [],
        correctAnswer: data.correctAnswer,
        points: data.points ?? 1,
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

    const publishedQuiz = question.quizQuestions.find(qq => qq.quiz.status === 'PUBLISHED');
    if (publishedQuiz) {
      throw new ForbiddenException('Cannot modify questions of a published quiz');
    }

    const merged = {
      type: data.type ?? question.type,
      text: data.text ?? question.text,
      options: data.options ?? question.options,
      correctAnswer: data.correctAnswer ?? question.correctAnswer,
    };

    if (merged.type === QuestionType.TRUE_FALSE) {
      if (merged.correctAnswer !== 'True' && merged.correctAnswer !== 'False') {
        throw new BadRequestException('correctAnswer must be "True" or "False" for TRUE_FALSE questions');
      }
    } else if (merged.type === QuestionType.MCQ) {
      if (!Array.isArray(merged.options) || merged.options.length < 2) {
        throw new BadRequestException('MCQ must have at least 2 options');
      }
      if (!merged.options.includes(merged.correctAnswer)) {
        throw new BadRequestException('correctAnswer must be one of the provided options for MCQ questions');
      }
    }

    const updated = await this.prisma.question.update({
      where: { id },
      data: {
        type: data.type,
        text: data.text,
        options: data.options,
        correctAnswer: data.correctAnswer,
        points: data.points,
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

    const publishedQuiz = question.quizQuestions.find(qq => qq.quiz.status === 'PUBLISHED');
    if (publishedQuiz) {
      throw new ForbiddenException('Cannot modify questions of a published quiz');
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

  async getQuestions(filter?: { type?: QuestionType }) {
    const where: any = {};
    if (filter?.type) {
      where.type = filter.type;
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

  async findAllUnassigned(filter?: { type?: QuestionType }) {
    const where: any = {
      quizQuestions: {
        none: {}
      }
    };
    
    if (filter?.type) {
      where.type = filter.type;
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

  async findByQuiz(quizId: string, filter?: { type?: QuestionType }) {
    const where: any = {
      quizQuestions: {
        some: { quizId }
      }
    };
    
    if (filter?.type) {
      where.type = filter.type;
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

  private mapQuestionResponse(question: any) {
    const { quizQuestions, ...rest } = question;
    return {
      ...rest,
      quizzes: (quizQuestions || []).map((qq: any) => qq.quiz)
    };
  }
}
