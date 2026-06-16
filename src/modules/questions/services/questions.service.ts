import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CreateQuestionDto } from '../dto/create-question.dto';
import { UpdateQuestionDto } from '../dto/update-question.dto';
import { QuestionType } from '../../../generated/prisma/client';

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

    return this.prisma.question.create({
      data: {
        quizId: data.quizId,
        type: data.type,
        text: data.text,
        options: data.options || [],
        correctAnswer: data.correctAnswer,
      }
    });
  }

  async updateQuestion(id: string, data: UpdateQuestionDto) {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) {
      throw new NotFoundException('Question not found');
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
    }

    return this.prisma.question.update({
      where: { id },
      data: {
        type: data.type,
        text: data.text,
        options: data.options,
        correctAnswer: data.correctAnswer,
      }
    });
  }

  async deleteQuestion(id: string) {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) {
      throw new NotFoundException('Question not found');
    }

    await this.prisma.question.delete({ where: { id } });
    return question;
  }
}
