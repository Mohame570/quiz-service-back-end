import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CreateQuestionDto } from '../dto/create-question.dto';

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
}
