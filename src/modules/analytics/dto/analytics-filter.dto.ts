// Shared filter query params for the Sprint 3 endpoints:
//   GET /analytics/questions/quality
//   GET /analytics/cohorts/distribution
//   GET /analytics/cohorts/export.csv
//
// All three parse query params through the same function so that "the
// export matches the active on-screen filter" is a structural guarantee
// (same parser, same resulting Prisma where-clause builder in the
// services below) rather than something that has to be kept in sync by
// hand across three separate implementations.

export interface AnalyticsFilterQuery {
  quizId?: string;
  cohort?: string;
  tags?: string; // comma-separated, e.g. "midterm,arrays"
  dateFrom?: string; // ISO date/datetime string, inclusive
  dateTo?: string; // ISO date/datetime string, inclusive
}

export interface ParsedAnalyticsFilter {
  quizId: string | null;
  cohort: string | null;
  tags: string[]; // empty array = no tag filter applied
  dateFrom: Date | null;
  dateTo: Date | null;
}

function parseDate(value: string | undefined, label: 'dateFrom' | 'dateTo'): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${label}: '${value}' is not a valid date`);
  }
  return parsed;
}

export function parseAnalyticsFilter(query: AnalyticsFilterQuery): ParsedAnalyticsFilter {
  const dateFrom = parseDate(query.dateFrom, 'dateFrom');
  const dateTo = parseDate(query.dateTo, 'dateTo');

  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new Error('dateFrom must not be after dateTo');
  }

  const tags = (query.tags ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  return {
    quizId: query.quizId?.trim() || null,
    cohort: query.cohort?.trim() || null,
    tags,
    dateFrom,
    dateTo,
  };
}
