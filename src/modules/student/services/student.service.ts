import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { AttemptStatus, QuizStatus } from '../../../generated/prisma/client';
import {
  StudentActiveAttemptDto,
  StudentQuizInstructionsDto,
  StudentQuizListItemDto,
  StudentQuizListResponseDto,
  deriveAttemptStatus,
} from '../dto';

interface AttemptRow {
  id: string;
  quizId: string;
  studentId: string;
  startedAt: Date;
  submittedAt: Date | null;
  status: AttemptStatus;
  durationMinutes?: number | null;
}

interface QuizRow {
  id: string;
  title: string;
  description: string | null;
  status: QuizStatus;
  durationMinutes: number | null;
  passingScore: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  questions?: { id: string }[];
}

@Injectable()
export class StudentService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // GET /api/student/quizzes
  // -------------------------------------------------------------------------

  async listQuizzesForStudent(
    studentId: string,
  ): Promise<StudentQuizListResponseDto> {
    const quizzes = await this.prisma.quiz.findMany({
      where: {
        status: QuizStatus.PUBLISHED,
        students: { some: { userId: studentId } },
      },
      include: { questions: { select: { id: true } } },
    });

    const now = new Date();
    const activeQuizzes = quizzes.filter((q) => this.isWithinWindow(q, now));
    const quizIds = activeQuizzes.map((q) => q.id);

    const attempts = quizIds.length
      ? await this.prisma.attempt.findMany({
          where: { studentId, quizId: { in: quizIds } },
        })
      : [];

    const items = activeQuizzes
      .map((quiz) => this.toListItem(quiz, attempts))
      .sort((a, b) => this.sortByWindow(a, b));

    return { items };
  }

  // -------------------------------------------------------------------------
  // GET /api/student/quizzes/:id
  // -------------------------------------------------------------------------

  async getQuizInstructions(
    studentId: string,
    quizId: string,
  ): Promise<StudentQuizInstructionsDto> {
    const quiz = await this.prisma.quiz.findFirst({
      where: {
        id: quizId,
        status: QuizStatus.PUBLISHED,
        students: { some: { userId: studentId } },
      },
      include: { questions: { select: { id: true } } },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found or not available.');
    }

    const now = new Date();
    const inWindow = this.isWithinWindow(quiz, now);

    const attempts = await this.prisma.attempt.findMany({
      where: { studentId, quizId },
    });

    const listItem = this.toListItem(quiz, attempts);
    const latestActiveAttempt = this.findLatestAttempt(attempts);

    return {
      ...listItem,
      canStart: inWindow,
      reasonIfBlocked: inWindow ? null : this.reasonForBlockedWindow(quiz, now),
      ...(latestActiveAttempt
        ? { attemptId: latestActiveAttempt.id }
        : { attemptId: listItem.attemptId }),
    };
  }

  // -------------------------------------------------------------------------
  // GET /api/student/attempts/active
  // -------------------------------------------------------------------------

  async getActiveAttempt(
    studentId: string,
  ): Promise<StudentActiveAttemptDto | null> {
    const attempt = await this.prisma.attempt.findFirst({
      where: { studentId, status: AttemptStatus.IN_PROGRESS },
      orderBy: { startedAt: 'desc' },
    });

    if (!attempt) {
      return null;
    }

    let expiresAt: Date | null = null;
    if (attempt.startedAt) {
      const quiz = await this.prisma.quiz.findUnique({
        where: { id: attempt.quizId },
        select: { durationMinutes: true },
      });

      if (quiz?.durationMinutes) {
        expiresAt = new Date(
          attempt.startedAt.getTime() + quiz.durationMinutes * 60_000,
        );
      }
    }

    return {
      attemptId: attempt.id,
      quizId: attempt.quizId,
      startedAt: attempt.startedAt,
      expiresAt,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private isWithinWindow(quiz: QuizRow, now: Date): boolean {
    if (quiz.startsAt && quiz.startsAt.getTime() > now.getTime()) {
      return false;
    }
    if (quiz.endsAt && quiz.endsAt.getTime() < now.getTime()) {
      return false;
    }
    return true;
  }

  private reasonForBlockedWindow(quiz: QuizRow, now: Date): string {
    if (quiz.startsAt && quiz.startsAt.getTime() > now.getTime()) {
      return 'Quiz has not started yet.';
    }
    if (quiz.endsAt && quiz.endsAt.getTime() < now.getTime()) {
      return 'Quiz window has closed.';
    }
    return 'Quiz is not currently available.';
  }

  private toListItem(
    quiz: QuizRow,
    attempts: AttemptRow[],
  ): StudentQuizListItemDto {
    const quizAttempts = attempts.filter((a) => a.quizId === quiz.id);
    const attemptStatus = deriveAttemptStatus(quizAttempts);
    const latestActive = this.findLatestAttempt(quizAttempts);

    return {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      durationMinutes: quiz.durationMinutes,
      passingScore: quiz.passingScore,
      startsAt: quiz.startsAt,
      endsAt: quiz.endsAt,
      questionCount: quiz.questions?.length ?? 0,
      attemptStatus,
      attemptId: latestActive ? latestActive.id : null,
    };
  }

  private findLatestAttempt(attempts: AttemptRow[]): AttemptRow | null {
    if (attempts.length === 0) return null;
    return attempts.reduce((latest, current) =>
      current.startedAt.getTime() > latest.startedAt.getTime()
        ? current
        : latest,
    );
  }

  private sortByWindow(
    a: StudentQuizListItemDto,
    b: StudentQuizListItemDto,
  ): number {
    const aTime = a.startsAt ? a.startsAt.getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.startsAt ? b.startsAt.getTime() : Number.POSITIVE_INFINITY;
    if (aTime !== bTime) {
      return aTime - bTime;
    }
    return a.id.localeCompare(b.id);
  }
}
