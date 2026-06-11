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

    let optionsData: { text: string; isCorrect: boolean }[] = [];
    if (data.type === 'TRUE_FALSE') {
      optionsData = [
        { text: 'True', isCorrect: data.correctAnswer === 'True' },
        { text: 'False', isCorrect: data.correctAnswer === 'False' },
      ];
    } else if (data.type === 'MCQ') {
      optionsData = (data.options || []).map((optionText) => ({
        text: optionText,
        isCorrect: optionText === data.correctAnswer,
      }));
    }

    return this.prisma.question.create({
      data: {
        quizId: data.quizId,
        type: data.type,
        text: data.text,
        options: {
          create: optionsData,
        },
      },
      include: {
        options: true,
      },
    });
  }
}
