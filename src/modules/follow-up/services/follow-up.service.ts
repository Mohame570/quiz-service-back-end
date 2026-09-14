import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AnalyticsService } from '../../analytics/services/analytics.service';
import { StudentQuizMetricDto } from '../../analytics/dto/quiz-metric.dto';
import {
  FOLLOW_UP_CATEGORY_META,
  FollowUpCategory,
  FollowUpEntryDto,
  FollowUpSummaryDto,
} from '../dto/follow-up.dto';

interface QuizFollowUpContext {
  id: string;
  title: string;
  endsAt: Date | null;
  passingScore: number | null;
}

/** Used when a quiz has no explicit passingScore configured. */
const DEFAULT_PASSING_SCORE = 60;

/** A NOT_STARTED student is flagged once the window closes within this many hours. */
const CLOSING_SOON_HOURS = 24;

@Injectable()
export class FollowUpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  /**
   * Implements docs/analytics-contract.md §15 — org-wide follow-up queue
   * across every quiz. No hardcoded categories or mock entries: every
   * entry is derived live from getStudentQuizMetrics() plus quiz
   * metadata (passingScore, endsAt) and the in-progress attempt's
   * expiresAt.
   */
  async getFollowUpQueue(): Promise<FollowUpSummaryDto> {
    const quizzes = await this.prisma.quiz.findMany({
      select: { id: true, title: true, endsAt: true, passingScore: true },
      orderBy: { createdAt: 'desc' },
    });

    const entries: FollowUpEntryDto[] = [];
    for (const quiz of quizzes) {
      entries.push(...(await this.buildEntriesForQuiz(quiz)));
    }
    return this.summarize(entries);
  }

  /** Same categorization, scoped to a single quiz. */
  async getFollowUpQueueForQuiz(quizId: string): Promise<FollowUpSummaryDto> {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      select: { id: true, title: true, endsAt: true, passingScore: true },
    });

    if (!quiz) {
      throw new NotFoundException(`Quiz with id '${quizId}' not found`);
    }

    const entries = await this.buildEntriesForQuiz(quiz);
    return this.summarize(entries);
  }

  private async buildEntriesForQuiz(quiz: QuizFollowUpContext): Promise<FollowUpEntryDto[]> {
    const studentMetrics = await this.analyticsService.getStudentQuizMetrics(quiz.id);
    if (studentMetrics.length === 0) {
      return [];
    }

    // Only IN_PROGRESS attempts need their expiresAt looked up, to tell
    // "actively within their time window" apart from "stalled — the
    // window closed but nothing finalized this attempt".
    const inProgressAttemptIds = studentMetrics
      .filter((m) => m.status === 'IN_PROGRESS' && m.attemptId)
      .map((m) => m.attemptId as string);

    const expiryByAttemptId = new Map<string, Date>();
    if (inProgressAttemptIds.length > 0) {
      const attempts = await this.prisma.attempt.findMany({
        where: { id: { in: inProgressAttemptIds } },
        select: { id: true, expiresAt: true },
      });
      for (const attempt of attempts) {
        expiryByAttemptId.set(attempt.id, attempt.expiresAt);
      }
    }

    const now = new Date();
    const passingScore = quiz.passingScore ?? DEFAULT_PASSING_SCORE;
    const closingSoonThreshold = quiz.endsAt
      ? new Date(quiz.endsAt.getTime() - CLOSING_SOON_HOURS * 60 * 60 * 1000)
      : null;

    const entries: FollowUpEntryDto[] = [];
    for (const metric of studentMetrics) {
      const classification = this.classify(metric, quiz, {
        now,
        passingScore,
        closingSoonThreshold,
        expiryByAttemptId,
      });

      if (classification) {
        entries.push({
          studentId: metric.studentId,
          studentName: metric.studentName,
          quizId: quiz.id,
          quizTitle: quiz.title,
          category: classification.category,
          reason: classification.reason,
          recommendedAction: classification.action,
          status: metric.status,
          score: metric.score,
          maxScore: metric.maxScore,
          percentage: metric.percentage,
          pendingEssayCount: metric.pendingEssayCount,
          attemptId: metric.attemptId,
        });
      }
    }
    return entries;
  }

  /**
   * Implements §15.1's priority-ordered category table. Each branch is a
   * deterministic function of the §6 status plus quiz metadata — never
   * an independent re-derivation of status.
   */
  private classify(
    metric: StudentQuizMetricDto,
    quiz: QuizFollowUpContext,
    ctx: {
      now: Date;
      passingScore: number;
      closingSoonThreshold: Date | null;
      expiryByAttemptId: Map<string, Date>;
    },
  ): { category: FollowUpCategory; reason: string; action: string } | null {
    if (metric.status === 'COMPLETED_PENDING_REVIEW') {
      return {
        category: FollowUpCategory.PENDING_ESSAY_REVIEW,
        reason: `${metric.pendingEssayCount} essay response(s) awaiting manual grading`,
        action: "Grade the pending essay response(s) to finalize this attempt's score.",
      };
    }

    // COMPLETED_PENDING_REVIEW already returned above, so reaching here
    // with a non-null percentage means status is plain COMPLETED.
    if (
      metric.status === 'COMPLETED' &&
      metric.percentage !== null &&
      metric.percentage < ctx.passingScore
    ) {
      return {
        category: FollowUpCategory.AT_RISK_LOW_SCORE,
        reason: `Scored ${metric.percentage}%, below the ${ctx.passingScore}% passing threshold`,
        action: 'Reach out with remediation resources or offer a retake.',
      };
    }

    if (metric.status === 'IN_PROGRESS') {
      const expiresAt = metric.attemptId ? ctx.expiryByAttemptId.get(metric.attemptId) : undefined;
      if (expiresAt && expiresAt < ctx.now) {
        return {
          category: FollowUpCategory.STALLED_IN_PROGRESS,
          reason: 'Attempt window expired but was never finalized as submitted or timed out',
          action: 'Investigate the stalled attempt and manually finalize or reset it.',
        };
      }
      // Still actively progressing within the attempt's time window — no
      // follow-up needed yet.
      return null;
    }

    if (metric.status === 'PARTICIPATED_NOT_COMPLETED') {
      return {
        category: FollowUpCategory.ABANDONED_NOT_COMPLETED,
        reason: 'Started the attempt but it timed out or was abandoned before submission',
        action: 'Contact the student to check for technical issues and offer a makeup attempt.',
      };
    }

    if (metric.status === 'ABSENT') {
      return {
        category: FollowUpCategory.ABSENT_NO_SHOW,
        reason: 'Assigned to this quiz but never attempted it before the window closed',
        action: 'Escalate the absence and schedule a makeup session.',
      };
    }

    if (
      metric.status === 'NOT_STARTED' &&
      ctx.closingSoonThreshold &&
      ctx.now >= ctx.closingSoonThreshold &&
      quiz.endsAt
    ) {
      return {
        category: FollowUpCategory.NOT_STARTED_CLOSING_SOON,
        reason: `Has not started yet and the window closes ${quiz.endsAt.toISOString()}`,
        action: 'Send an urgent reminder before the window closes.',
      };
    }

    return null;
  }

  /**
   * Always returns all six category groups, even at count 0 — see
   * docs/analytics-contract.md §15.2's empty-cohort rule. Mirrors the
   * "always show the full shape" discipline used for score-distribution
   * buckets in AnalyticsService.getDashboardMetrics().
   */
  private summarize(entries: FollowUpEntryDto[]): FollowUpSummaryDto {
    const categories = FOLLOW_UP_CATEGORY_META.map((meta) => {
      const categoryEntries = entries.filter((entry) => entry.category === meta.category);
      return {
        category: meta.category,
        label: meta.label,
        description: meta.description,
        count: categoryEntries.length,
        entries: categoryEntries,
      };
    });

    return {
      totalFollowUps: entries.length,
      categories,
    };
  }
}
