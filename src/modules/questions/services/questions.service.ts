import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CreateQuestionDto } from '../dto/create-question.dto';
import { UpdateQuestionDto } from '../dto/update-question.dto';
import { QuestionType } from '../../../generated/prisma/client';
import { normalizeShortText } from '../../attempts/utils/text-answer.util';

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async createQuestion(data: CreateQuestionDto) {
    // Validate if quiz exists
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: data.quizId }
    });

    if (!quiz) {
      throw new BadRequestException('Quiz not found');
    }
    if (quiz.status === 'PUBLISHED') {
      throw new ForbiddenException('Cannot modify questions of a published quiz');
    }

    const correctAnswer =
      data.type === QuestionType.SHORT_TEXT && data.correctAnswer
        ? normalizeShortText(data.correctAnswer)
        : data.correctAnswer ?? '';

    return this.prisma.question.create({
      data: {
        quizId: data.quizId,
        type: data.type,
        text: data.text,
        options: data.options || [],
        correctAnswer,
        points: data.points ?? 1,
        order: data.order ?? 0,
      }
    });
  }

  async updateQuestion(id: string, data: UpdateQuestionDto) {
    const question = await this.prisma.question.findUnique({ 
      where: { id },
      include: { quiz: true }
    });
    if (!question) {
      throw new NotFoundException('Question not found');
    }
    if (question.quiz.status === 'PUBLISHED') {
      throw new ForbiddenException('Cannot modify questions of a published quiz');
    }

    const merged = {
      type: data.type ?? question.type,
      text: data.text ?? question.text,
      options: data.options ?? question.options,
      correctAnswer: data.correctAnswer ?? question.correctAnswer,
    };

    // Validate correctAnswer against options/type
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
    } else if (merged.type === QuestionType.SHORT_TEXT) {
      if (!merged.correctAnswer.trim()) {
        throw new BadRequestException('correctAnswer must be a non-empty string for SHORT_TEXT questions');
      }
      merged.correctAnswer = normalizeShortText(merged.correctAnswer);
    }

    return this.prisma.question.update({
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
        order: data.order,
      }
    });
  }

  async deleteQuestion(id: string) {
    const question = await this.prisma.question.findUnique({ 
      where: { id },
      include: { quiz: true }
    });
    if (!question) {
      throw new NotFoundException('Question not found');
    }
    if (question.quiz.status === 'PUBLISHED') {
      throw new ForbiddenException('Cannot modify questions of a published quiz');
    }

    await this.prisma.question.delete({ where: { id } });
    return question;
  }

  async getQuestion(id: string) {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) {
      throw new NotFoundException('Question not found');
    }
    return question;
  }

  async getQuestions(quizId?: string) {
    if (quizId) {
      return this.prisma.question.findMany({ 
        where: { quizId },
        orderBy: { order: 'asc' }
      });
    }
    return this.prisma.question.findMany({
      orderBy: { order: 'asc' }
    });
  }

  /**
   * Helper method for the quiz module to validate if a quiz has at least one question
   * before allowing it to be published.
   */
  async validateQuizHasQuestions(quizId: string): Promise<boolean> {
    const count = await this.prisma.question.count({ where: { quizId } });
    return count > 0;
  }
}
