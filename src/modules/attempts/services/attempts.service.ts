// src/modules/attempts/services/attempts.service.ts

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AttemptStatus, Prisma } from '../../../generated/prisma/client';
import { ScoringService } from './scoring.service';
import { analyticsEvents$ } from '../../analytics/analytics.events';
import { SaveAnswerItemDto } from '../dto/save-answers.dto';
import {
  AttemptAnswerResponseDto,
  AttemptResponseDto,
  AttemptSummaryDto,
} from '../dto/attempt-response.dto';

@Injectable()
export class AttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringService: ScoringService,
  ) {}

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

    if (quiz.maxAttempts != null) {
      const consumed = await this.prisma.attempt.count({
        where: {
          quizId,
          studentId,
          status: { in: [AttemptStatus.SUBMITTED, AttemptStatus.TIMED_OUT] },
        },
      });
      if (consumed >= quiz.maxAttempts) {
        throw new ForbiddenException(
          `Attempt limit reached (${quiz.maxAttempts}).`,
        );
      }
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
  // Official score (BEST vs LATEST)
  // -----------------------------------------------------------------------

  async getOfficialScore(quizId: string, studentId: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      select: { scoreStrategy: true },
    });
    if (!quiz) throw new NotFoundException('Quiz not found.');

    const attempts = await this.prisma.attempt.findMany({
      where: {
        quizId,
        studentId,
        status: { in: [AttemptStatus.SUBMITTED, AttemptStatus.TIMED_OUT] },
        score: { not: null },
      },
      orderBy: { submittedAt: 'desc' },
    });

    if (attempts.length === 0) {
      return { quizId, strategy: quiz.scoreStrategy, officialScore: null, attemptId: null, attemptsCount: 0 };
    }

    const official =
      quiz.scoreStrategy === 'BEST'
        ? attempts.reduce((a, b) => (b.score! > a.score! ? b : a))
        : attempts[0]; // LATEST — newest first

    return {
      quizId,
      strategy: quiz.scoreStrategy,
      officialScore: official.score,
      attemptId: official.id,
      attemptsCount: attempts.length,
    };
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
          selectedOptionIds: (item as any).selectedOptionIds ?? [],
          textAnswer: item.textAnswer ?? null,
          answeredAt: now,
        },
        update: {
          selectedOptionId: item.selectedOptionId ?? null,
          selectedOptionIds: (item as any).selectedOptionIds ?? [],
          textAnswer: item.textAnswer ?? null,
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
                selectedOptionIds: (item as any).selectedOptionIds ?? [],
                textAnswer: item.textAnswer ?? null,
                answeredAt: now,
              },
              update: {
                selectedOptionId: item.selectedOptionId ?? null,
                selectedOptionIds: (item as any).selectedOptionIds ?? [],
                textAnswer: item.textAnswer ?? null,
                answeredAt: now,
              },
            }),
          ),
        );

        // Snapshot: freeze question state at submit time for immutability
        const questionIds = items.map((i) => i.questionId);
        const questions = await tx.question.findMany({ where: { id: { in: questionIds } } });
        const qMap = new Map(questions.map((q) => [q.id, q]));
        for (const item of items) {
          const q: any = qMap.get(item.questionId);
          if (!q) continue;
          await tx.attemptAnswer.update({
            where: { attemptId_questionId: { attemptId: id, questionId: item.questionId } },
            data: {
              snapshotText: q.text,
              snapshotOptions: q.options,
              snapshotCorrectAnswer: q.correctAnswer,
              snapshotCorrectAnswers: q.correctAnswers ?? [],
              snapshotType: q.type,
              snapshotPoints: q.points,
              snapshotCodeSnippet: q.codeSnippet ?? null,
              snapshotCodeLanguage: q.codeLanguage ?? null,
            },
          });
        }
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

    // Emit analytics event for real-time updates
    try {
      analyticsEvents$.next({
        type: 'attempt_submitted',
        payload: {
          quizId: attempt.quizId,
          attemptId: updated.id,
          studentId,
          score: updated.score ?? null,
          submittedAt: updated.submittedAt ?? null,
        },
      });
    } catch (e) {
      // swallow errors to avoid affecting normal flow
      console.error('Failed to emit analytics event', e);
    }

    // Sprint 2: grade the attempt immediately after it's finalised.
    return this.scoringService.scoreAttempt(id);
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
      selectedOptionIds: answer.selectedOptionIds ?? [],
      textAnswer: answer.textAnswer,
      pointsEarned: answer.pointsEarned ?? null,
      isCorrect: answer.isCorrect,
      answeredAt: answer.answeredAt,
      snapshotText: answer.snapshotText,
      snapshotOptions: answer.snapshotOptions,
      snapshotCorrectAnswer: answer.snapshotCorrectAnswer,
      snapshotCorrectAnswers: answer.snapshotCorrectAnswers,
      snapshotType: answer.snapshotType,
      snapshotPoints: answer.snapshotPoints,
    };
  }
}
