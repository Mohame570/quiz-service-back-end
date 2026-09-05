import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AttemptStatus, GradingStatus } from '../../../generated/prisma/client';
import { DashboardSummaryDto } from '../dto/dashboard-summary.dto';
import { QuizAttemptsResponseDto } from '../dto/quiz-attempts-response.dto';
import { QuizStudentScoreDto } from '../dto/quiz-attempt.dto';
import {
  QuizMetricSummaryDto,
  StudentQuizMetricDto,
  StudentQuizStatus,
} from '../dto/quiz-metric.dto';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnalytics(): Promise<DashboardSummaryDto> {
    const totalQuizzes = await this.prisma.quiz.count();
    const totalStudents = await this.prisma.user.count({
      where: { role: 'STUDENT' },
    });
    const totalAttempts = await this.prisma.attempt.count();
    const averageScore = await this.prisma.attempt.aggregate({
      _avg: { score: true },
    });

    return {
      totalQuizzes,
      totalStudents,
      totalAttempts,
      averageScore: Number(averageScore._avg?.score ?? 0),
    };

  }
  async getQuizAttempts(quizTitle: string): Promise<QuizAttemptsResponseDto> {
    const quiz = await this.prisma.quiz.findFirst({
      where: { title: quizTitle },
      select: { id: true, title: true },
    });

    if (!quiz) {
      throw new NotFoundException(`Quiz with title '${quizTitle}' not found`);
    }

    const [students, attempts] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'STUDENT' },
        select: { id: true, name: true },
      }),
      this.prisma.attempt.findMany({
        where: { quizId: quiz.id },
        select: {
          id: true,
          studentId: true,
          score: true,
          status: true,
          startedAt: true,
          submittedAt: true,
        },
        orderBy: { startedAt: 'desc' },
      }),
    ]);

    const attemptsByStudent = new Map<string, typeof attempts[0]>();
    for (const attempt of attempts) {
      const existing = attemptsByStudent.get(attempt.studentId);
      if (!existing || attempt.startedAt > existing.startedAt) {
        attemptsByStudent.set(attempt.studentId, attempt);
      }
    }

    const statusBreakdown = {
      notStarted: 0,
      inProgress: 0,
      submitted: 0,
    };

    const studentScores: QuizStudentScoreDto[] = students.map((student) => {
      const latestAttempt = attemptsByStudent.get(student.id);
      if (!latestAttempt) {
        statusBreakdown.notStarted += 1;
        return {
          studentId: student.id,
          studentName: student.name ?? 'Unknown Student',
          status: 'NOT_STARTED' as const,
          score: null,
          attemptId: null,
          startedAt: null,
          submittedAt: null,
        };
      }

      if (latestAttempt.status === AttemptStatus.IN_PROGRESS) {
        statusBreakdown.inProgress += 1;
      } else if (latestAttempt.status === AttemptStatus.SUBMITTED) {
        statusBreakdown.submitted += 1;
      } else {
        statusBreakdown.inProgress += 1;
      }

      return {
        studentId: student.id,
        studentName: student.name ?? 'Unknown Student',
        status:
          latestAttempt.status === AttemptStatus.SUBMITTED
            ? 'SUBMITTED'
            : 'IN_PROGRESS',
        score: latestAttempt.score ?? null,
        attemptId: latestAttempt.id,
        startedAt: latestAttempt.startedAt,
        submittedAt: latestAttempt.submittedAt,
      };
    });

    const submittedAttempts = attempts.filter(
      (attempt) => attempt.status === AttemptStatus.SUBMITTED,
    );
    const completionCount = submittedAttempts.length;
    const averageScore =
      completionCount > 0
        ?
            submittedAttempts.reduce((sum, attempt) => sum + (attempt.score ?? 0), 0) /
            completionCount
        : 0;

    const studentIds = [...new Set(attempts.map((attempt) => attempt.studentId))];
    const submittedStudents = await this.prisma.user.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, name: true },
    });
    const studentNameById = new Map(
      submittedStudents.map((student) => [student.id, student.name ?? 'Unknown Student']),
    );

    return {
      quizId: quiz.id,
      quizTitle: quiz.title,
      attemptCount: attempts.length,
      completionCount,
      averageScore,
      statusBreakdown,
      attempts: attempts
        .filter((attempt) => attempt.status === AttemptStatus.SUBMITTED)
        .map((attempt) => ({
          attemptId: attempt.id,
          studentName: studentNameById.get(attempt.studentId) ?? 'Unknown Student',
          score: attempt.score ?? 0,
          submittedAt: attempt.submittedAt!,
        })),
      studentScores,
    };
  }

  /**
   * Implements docs/analytics-contract.md §6/§7 — the assignment-anchored
   * per-student and per-quiz metrics (status enum, absence vs not-started,
   * follow-up), distinct from the older getQuizAttempts() above which does
   * not filter to the quiz's assigned students.
   */
  async getStudentQuizMetrics(quizId: string): Promise<StudentQuizMetricDto[]> {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        endsAt: true,
        students: { select: { userId: true, user: { select: { name: true } } } },
      },
    });

    if (!quiz) {
      throw new NotFoundException(`Quiz with id '${quizId}' not found`);
    }

    const windowClosed = quiz.endsAt !== null && quiz.endsAt < new Date();
    const assignedStudentIds = quiz.students.map((s) => s.userId);

    if (assignedStudentIds.length === 0) {
      return [];
    }

    const attempts = await this.prisma.attempt.findMany({
      where: { quizId, studentId: { in: assignedStudentIds } },
      select: {
        id: true,
        studentId: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        result: {
          select: {
            score: true,
            maxScore: true,
            percentage: true,
            gradingStatus: true,
            pendingEssayCount: true,
          },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    const latestAttemptByStudent = new Map<string, (typeof attempts)[number]>();
    for (const attempt of attempts) {
      const existing = latestAttemptByStudent.get(attempt.studentId);
      if (!existing || attempt.startedAt > existing.startedAt) {
        latestAttemptByStudent.set(attempt.studentId, attempt);
      }
    }

    return quiz.students.map(({ userId, user }): StudentQuizMetricDto => {
      const latest = latestAttemptByStudent.get(userId);

      // §4: zero attempts — ABSENT only once the window has closed,
      // otherwise NOT_STARTED. This is the rule the whole contract exists
      // to protect; do not collapse these two branches.
      if (!latest) {
        return {
          studentId: userId,
          studentName: user.name ?? 'Unknown Student',
          quizId,
          status: windowClosed ? 'ABSENT' : 'NOT_STARTED',
          score: null,
          maxScore: null,
          percentage: null,
          attemptId: null,
          startedAt: null,
          submittedAt: null,
          followUpRequired: false,
          pendingEssayCount: 0,
        };
      }

      let status: StudentQuizStatus;
      if (latest.status === AttemptStatus.IN_PROGRESS) {
        status = 'IN_PROGRESS';
      } else if (latest.status === AttemptStatus.SUBMITTED) {
        status =
          latest.result?.gradingStatus === GradingStatus.PARTIAL &&
          latest.result.pendingEssayCount > 0
            ? 'COMPLETED_PENDING_REVIEW'
            : 'COMPLETED';
      } else {
        // TIMED_OUT or ABANDONED
        status = 'PARTICIPATED_NOT_COMPLETED';
      }

      const isCompleted = status === 'COMPLETED' || status === 'COMPLETED_PENDING_REVIEW';

      return {
        studentId: userId,
        studentName: user.name ?? 'Unknown Student',
        quizId,
        status,
        score: isCompleted ? (latest.result?.score ?? null) : null,
        maxScore: isCompleted ? (latest.result?.maxScore ?? null) : null,
        percentage: isCompleted ? (latest.result?.percentage ?? null) : null,
        attemptId: latest.id,
        startedAt: latest.startedAt,
        submittedAt: latest.submittedAt,
        followUpRequired: status === 'COMPLETED_PENDING_REVIEW',
        pendingEssayCount: latest.result?.pendingEssayCount ?? 0,
      };
    });
  }

  /** Implements docs/analytics-contract.md §7 — aggregates §6's per-student
   * metrics into the quiz-level summary shape. */
  async getQuizMetricSummary(quizId: string): Promise<QuizMetricSummaryDto> {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      select: { id: true, title: true, endsAt: true },
    });

    if (!quiz) {
      throw new NotFoundException(`Quiz with id '${quizId}' not found`);
    }

    const studentMetrics = await this.getStudentQuizMetrics(quizId);
    const windowClosed = quiz.endsAt !== null && quiz.endsAt < new Date();
    const assignedCount = studentMetrics.length;

    const participationCount = studentMetrics.filter(
      (m) => m.status !== 'NOT_STARTED' && m.status !== 'ABSENT',
    ).length;
    const completionCount = studentMetrics.filter(
      (m) => m.status === 'COMPLETED' || m.status === 'COMPLETED_PENDING_REVIEW',
    ).length;
    // §4: absenceCount must stay 0 while the window is open — never
    // computed from raw zero-attempt counts alone.
    const absenceCount = windowClosed
      ? studentMetrics.filter((m) => m.status === 'ABSENT').length
      : 0;
    const followUpCount = studentMetrics.filter((m) => m.followUpRequired).length;

    const completedPercentages = studentMetrics
      .filter((m) => m.percentage !== null)
      .map((m) => m.percentage as number);
    const averageScore =
      completedPercentages.length > 0
        ? completedPercentages.reduce((sum, p) => sum + p, 0) / completedPercentages.length
        : null;

    return {
      quizId: quiz.id,
      quizTitle: quiz.title,
      windowClosed,
      assignedCount,
      participationCount,
      completionCount,
      absenceCount,
      followUpCount,
      participationRate: assignedCount > 0 ? participationCount / assignedCount : 0,
      completionRate: assignedCount > 0 ? completionCount / assignedCount : 0,
      averageScore,
    };
  }
}