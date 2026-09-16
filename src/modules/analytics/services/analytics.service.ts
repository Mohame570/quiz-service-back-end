import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AttemptStatus, GradingStatus } from '../../../generated/prisma/client';
import { DashboardSummaryDto } from '../dto/dashboard-summary.dto';
import { QuizAttemptsResponseDto } from '../dto/quiz-attempts-response.dto';
import { QuizStudentScoreDto } from '../dto/quiz-attempt.dto';
import {
  DashboardMetricsDto,
  QuizMetricSummaryDto,
  ScoreDistributionBucketDto,
  SCORE_DISTRIBUTION_RANGES,
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

  /**
   * Implements the Sprint 2 brief: a live, org-wide dashboard summary
   * computed directly from database records — no hardcoded KPI
   * constants, no mock fallbacks. Reuses getQuizMetricSummary() and
   * getStudentQuizMetrics() (already covered by docs/analytics-contract.md
   * §4-§7 rules) rather than re-deriving the status logic, so the
   * per-quiz table in this response and the standalone per-quiz
   * endpoints can never disagree.
   *
   * Honest empty-state handling: with zero quizzes in the database this
   * returns real zeros and null (not NaN) for every rate/average, and
   * all five score-distribution buckets present at count 0 — the
   * frontend is expected to render that as an explicit "no data yet"
   * state rather than treating 0 as a real participation rate.
   */
  async getDashboardMetrics(): Promise<DashboardMetricsDto> {
    const quizzes = await this.prisma.quiz.findMany({
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    const emptyDistribution: ScoreDistributionBucketDto[] = SCORE_DISTRIBUTION_RANGES.map(
      (range) => ({ range, count: 0 }),
    );

    if (quizzes.length === 0) {
      return {
        totalQuizzes: 0,
        distinctStudentCount: 0,
        assignedCount: 0,
        participationCount: 0,
        completionCount: 0,
        absenceCount: 0,
        followUpCount: 0,
        participationRate: 0,
        completionRate: 0,
        averageScore: null,
        scoreDistribution: emptyDistribution,
        quizzes: [],
      };
    }

    const quizSummaries: QuizMetricSummaryDto[] = [];
    const allStudentMetrics: StudentQuizMetricDto[] = [];

    for (const { id } of quizzes) {
      const [summary, studentMetrics] = await Promise.all([
        this.getQuizMetricSummary(id),
        this.getStudentQuizMetrics(id),
      ]);
      quizSummaries.push(summary);
      allStudentMetrics.push(...studentMetrics);
    }

    const distinctStudentCount = new Set(allStudentMetrics.map((m) => m.studentId)).size;

    const assignedCount = quizSummaries.reduce((sum, q) => sum + q.assignedCount, 0);
    const participationCount = quizSummaries.reduce((sum, q) => sum + q.participationCount, 0);
    const completionCount = quizSummaries.reduce((sum, q) => sum + q.completionCount, 0);
    const absenceCount = quizSummaries.reduce((sum, q) => sum + q.absenceCount, 0);
    const followUpCount = quizSummaries.reduce((sum, q) => sum + q.followUpCount, 0);

    const percentages = allStudentMetrics
      .filter((m) => m.percentage !== null)
      .map((m) => m.percentage as number);
    const averageScore =
      percentages.length > 0
        ? percentages.reduce((sum, p) => sum + p, 0) / percentages.length
        : null;

    // Half-open intervals ([0,20), [20,40), [40,60), [60,80), [80,100]) so
    // every possible percentage (including fractional, e.g. 43.33) lands
    // in exactly one bucket — bucketing on the label string's parsed
    // integers would leave gaps like 20.5 matching neither "0-20" nor
    // "21-40".
    const bucketBounds: Array<[number, number]> = [
      [0, 20],
      [20, 40],
      [40, 60],
      [60, 80],
      [80, 100],
    ];
    const distribution: ScoreDistributionBucketDto[] = SCORE_DISTRIBUTION_RANGES.map(
      (range, index) => {
        const [lo, hi] = bucketBounds[index];
        const isLastBucket = index === bucketBounds.length - 1;
        const count = percentages.filter((p) =>
          isLastBucket ? p >= lo && p <= hi : p >= lo && p < hi,
        ).length;
        return { range, count };
      },
    );

    return {
      totalQuizzes: quizzes.length,
      distinctStudentCount,
      assignedCount,
      participationCount,
      completionCount,
      absenceCount,
      followUpCount,
      participationRate: assignedCount > 0 ? participationCount / assignedCount : 0,
      completionRate: assignedCount > 0 ? completionCount / assignedCount : 0,
      averageScore,
      scoreDistribution: distribution,
      quizzes: quizSummaries,
    };
  }
}