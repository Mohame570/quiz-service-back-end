import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ParsedAnalyticsFilter } from '../dto/analytics-filter.dto';
import { CohortDistributionDto, CohortStudentStandingDto } from '../dto/cohort-distribution.dto';
import { SCORE_DISTRIBUTION_RANGES, ScoreDistributionBucketDto } from '../dto/quiz-metric.dto';

interface RawStandingRow {
  studentId: string;
  studentName: string;
  cohort: string | null;
  quizId: string;
  quizTitle: string;
  score: number;
  maxScore: number;
  percentage: number;
  submittedAt: Date;
}

@Injectable()
export class CohortDistributionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Implements docs/analytics-calculations.md §2. Used by BOTH
   * getDistribution() and CohortDistributionController's CSV export —
   * one query builder means the export can never drift from what the
   * on-screen filters show.
   */
  private async getFilteredStandingRows(filter: ParsedAnalyticsFilter): Promise<RawStandingRow[]> {
    const quizzes = await this.prisma.quiz.findMany({
      where: {
        id: filter.quizId ?? undefined,
        tags: filter.tags.length > 0 ? { hasSome: filter.tags } : undefined,
      },
      select: { id: true, title: true },
    });

    if (quizzes.length === 0) return [];
    const quizTitleById = new Map(quizzes.map((q) => [q.id, q.title]));

    const attempts = await this.prisma.attempt.findMany({
      where: {
        quizId: { in: quizzes.map((q) => q.id) },
        submittedAt: {
          gte: filter.dateFrom ?? undefined,
          lte: filter.dateTo ?? undefined,
        },
        student: filter.cohort ? { cohort: filter.cohort } : undefined,
        result: { isNot: null },
      },
      select: {
        studentId: true,
        submittedAt: true,
        quizId: true,
        student: { select: { cohort: true, user: { select: { name: true } } } },
        result: { select: { score: true, maxScore: true, percentage: true } },
      },
    });

    return attempts
      .filter((a) => a.result !== null && a.submittedAt !== null)
      .map((a) => ({
        studentId: a.studentId,
        studentName: a.student.user.name ?? 'Unknown student',
        cohort: a.student.cohort,
        quizId: a.quizId,
        quizTitle: quizTitleById.get(a.quizId) ?? 'Unknown quiz',
        score: a.result!.score,
        maxScore: a.result!.maxScore,
        percentage: a.result!.percentage,
        submittedAt: a.submittedAt as Date,
      }));
  }

  async getDistribution(filter: ParsedAnalyticsFilter): Promise<CohortDistributionDto> {
    const rows = await this.getFilteredStandingRows(filter);
    const standings = rankStandings(rows);
    const percentages = rows.map((r) => r.percentage);

    return {
      totalCompletedAttempts: rows.length,
      averagePercentage: mean(percentages),
      medianPercentage: median(percentages),
      standardDeviationPercentage: populationStdDev(percentages),
      scoreDistribution: bucketize(percentages),
      standings,
    };
  }

  /** Same filtered row set as getDistribution(), for the CSV export. */
  async getStandingsForExport(filter: ParsedAnalyticsFilter): Promise<CohortStudentStandingDto[]> {
    const rows = await this.getFilteredStandingRows(filter);
    return rankStandings(rows);
  }
}

// ---------------------------------------------------------------------
// Pure functions — documented and hand-verified in
// docs/analytics-calculations.md §2. Kept free of PrismaService so the
// arithmetic itself is directly unit-testable without mocking the DB.
// ---------------------------------------------------------------------

export function rankStandings(rows: RawStandingRow[]): CohortStudentStandingDto[] {
  const total = rows.length;
  const sorted = [...rows].sort((a, b) => b.percentage - a.percentage);

  return sorted.map((row, index) => {
    // Standard competition ranking: rank = 1 + count of strictly-higher
    // scores. Walk back from this position while ties persist.
    let rank = index + 1;
    while (rank > 1 && sorted[rank - 2].percentage === row.percentage) {
      rank -= 1;
    }

    const countBelow = sorted.filter((r) => r.percentage < row.percentage).length;
    const percentile = total > 1 ? round2((countBelow / total) * 100) : 100;

    return { ...row, rank, percentile };
  });
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return round2(values.reduce((sum, v) => sum + v, 0) / values.length);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return round2(value);
}

export function populationStdDev(values: number[]): number | null {
  if (values.length === 0) return null;
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return round2(Math.sqrt(variance));
}

export function bucketize(percentages: number[]): ScoreDistributionBucketDto[] {
  return SCORE_DISTRIBUTION_RANGES.map((range) => {
    const [lo, hi] = range.split('-').map(Number);
    const count = percentages.filter((p) => (hi === 100 ? p >= lo && p <= hi : p >= lo && p < hi)).length;
    return { range, count };
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
