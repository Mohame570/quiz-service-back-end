// src/modules/attempts/services/attempts.service.ts

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AttemptStatus, Prisma } from '../../../generated/prisma/client';
import { SaveAnswerItemDto } from '../dto/save-answers.dto';
import {
  AttemptAnswerResponseDto,
  AttemptResponseDto,
  AttemptSummaryDto,
} from '../dto/attempt-response.dto';

@Injectable()
export class AttemptsService {
  constructor(private readonly prisma: PrismaService) {}

  // -----------------------------------------------------------------------
  // Start
  // -----------------------------------------------------------------------

  async start(quizId: string, studentId: string): Promise<AttemptResponseDto> {
    const [quiz, studentProfile] = await Promise.all([
      this.prisma.quiz.findUnique({ where: { id: quizId } }),
      this.prisma.studentProfile.findUnique({ where: { userId: studentId } }),
    ]);

    if (!quiz) {
      throw new NotFoundException('Quiz not found.');
    }

    if (!studentProfile) {
      throw new ForbiddenException('Student profile not found.');
    }

    const startedAt = new Date();
    const expiresAt = new Date(
      startedAt.getTime() + (quiz.durationMinutes ?? 30) * 60_000,
    );

    const attempt = await this.prisma.attempt.create({
      data: {
        quizId,
        studentId,
        startedAt,
        expiresAt,
        status: AttemptStatus.IN_PROGRESS,
      },
      include: { answers: true },
    });
    return this.toResponseDto(attempt);
  }

  // -----------------------------------------------------------------------
  // List
  // -----------------------------------------------------------------------

  async list(studentId: string, quizId?: string): Promise<AttemptSummaryDto[]> {
    const where: Prisma.AttemptWhereInput = { studentId };
    if (quizId) where.quizId = quizId;

    const attempts = await this.prisma.attempt.findMany({
      where,
      orderBy: { startedAt: 'desc' },
    });

    return attempts.map(this.toSummaryDto);
  }

  // -----------------------------------------------------------------------
  // Find one
  // -----------------------------------------------------------------------

  async findOne(id: string, studentId: string): Promise<AttemptResponseDto> {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id },
      include: { answers: true },
    });

    if (!attempt) throw new NotFoundException('Attempt not found.');
    if (attempt.studentId !== studentId) throw new ForbiddenException('Access denied.');

    return this.toResponseDto(attempt);
  }

  // -----------------------------------------------------------------------
  // Save answers (incremental upsert)
  // -----------------------------------------------------------------------

  async saveAnswers(
    id: string,
    studentId: string,
    items: SaveAnswerItemDto[],
  ): Promise<AttemptAnswerResponseDto[]> {
    const attempt = await this.findAttemptOrThrow(id, studentId);
    this.assertInProgress(attempt);

    const now = new Date();

    const upserts = items.map((item) =>
      this.prisma.attemptAnswer.upsert({
        where: {
          attemptId_questionId: {
            attemptId: id,
            questionId: item.questionId,
          },
        },
        create: {
          attemptId: id,
          questionId: item.questionId,
          selectedOptionId: item.selectedOptionId ?? null,
          answeredAt: now,
        },
        update: {
          selectedOptionId: item.selectedOptionId ?? null,
          answeredAt: now,
        },
      }),
    );

    const saved = await this.prisma.$transaction(upserts);
    return saved.map(this.toAnswerDto);
  }

  // -----------------------------------------------------------------------
  // Submit
  // -----------------------------------------------------------------------

  async submit(
    id: string,
    studentId: string,
    items: SaveAnswerItemDto[],
  ): Promise<AttemptResponseDto> {
    const attempt = await this.findAttemptOrThrow(id, studentId);
    this.assertInProgress(attempt);

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      if (items.length > 0) {
        await Promise.all(
          items.map((item) =>
            tx.attemptAnswer.upsert({
              where: {
                attemptId_questionId: {
                  attemptId: id,
                  questionId: item.questionId,
                },
              },
              create: {
                attemptId: id,
                questionId: item.questionId,
                selectedOptionId: item.selectedOptionId ?? null,
                answeredAt: now,
              },
              update: {
                selectedOptionId: item.selectedOptionId ?? null,
                answeredAt: now,
              },
            }),
          ),
        );
      }

      await tx.attempt.update({
        where: { id },
        data: {
          status: AttemptStatus.SUBMITTED,
          submittedAt: now,
        },
      });

      return tx.attempt.findUnique({
        where: { id },
        include: { answers: true },
      });
    });

    if (!updated) {
      throw new NotFoundException('Attempt not found.');
    }

    return this.toResponseDto(updated);
  }

  // -----------------------------------------------------------------------
  // Get result (post-submission)
  // -----------------------------------------------------------------------

  async getResult(id: string, studentId: string): Promise<AttemptResponseDto> {
    const attempt = await this.findAttemptOrThrow(id, studentId, true);

    if (attempt.status === AttemptStatus.IN_PROGRESS) {
      throw new ConflictException('Attempt has not been submitted yet.');
    }

    return this.toResponseDto(attempt);
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private async findAttemptOrThrow(
    id: string,
    studentId: string,
    includeAnswers = false,
  ) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id },
      include: includeAnswers ? { answers: true } : undefined,
    });

    if (!attempt) throw new NotFoundException('Attempt not found.');
    if (attempt.studentId !== studentId) throw new ForbiddenException('Access denied.');

    return attempt;
  }

  private assertInProgress(attempt: { status: AttemptStatus; id: string }) {
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new ConflictException(
        `Cannot modify a '${attempt.status.toLowerCase()}' attempt.`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Mappers
  // -----------------------------------------------------------------------

  private toResponseDto(attempt: any): AttemptResponseDto {
    return {
      id: attempt.id,
      quizId: attempt.quizId,
      studentId: attempt.studentId,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      status: attempt.status,
      score: attempt.score,
      maxScore: attempt.maxScore,
      createdAt: attempt.createdAt,
      updatedAt: attempt.updatedAt,
      answers: (attempt.answers ?? []).map(this.toAnswerDto),
    };
  }

  private toSummaryDto(attempt: any): AttemptSummaryDto {
    return {
      id: attempt.id,
      quizId: attempt.quizId,
      studentId: attempt.studentId,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      status: attempt.status,
      score: attempt.score,
      maxScore: attempt.maxScore,
    };
  }

  private toAnswerDto(answer: any): AttemptAnswerResponseDto {
    return {
      id: answer.id,
      attemptId: answer.attemptId,
      questionId: answer.questionId,
      selectedOptionId: answer.selectedOptionId,
      isCorrect: answer.isCorrect,
      answeredAt: answer.answeredAt,
    };
  }
}
