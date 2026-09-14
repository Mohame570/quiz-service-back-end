// test/analytics/dashboard-metrics.e2e-spec.ts
//
// Covers docs/analytics-contract.md §14 (GET /analytics/dashboard):
//   1. Empty cohort — zero quizzes must produce real 0s/null, never
//      NaN, and all five score-distribution buckets present at 0.
//   2. Seeded cohort — a mocked dataset shaped exactly like
//      prisma/seeds/analytics-mock.ts (one closed-window quiz covering
//      COMPLETED / zero-score-COMPLETED / COMPLETED_PENDING_REVIEW /
//      PARTICIPATED_NOT_COMPLETED / ABSENT, one open-window quiz with a
//      NOT_STARTED contrast case, and one zero-assignment quiz) is used
//      to hand-verify every aggregate the dashboard endpoint returns.
//
// Uses NestJS's Test.createTestingModule with a stubbed PrismaService —
// same pattern as the existing test/analytics.e2e-spec.ts — rather than
// a live database, so these run in any environment without Docker.

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AnalyticsController } from '../../src/modules/analytics/controllers/analytics.controller';
import { AnalyticsService } from '../../src/modules/analytics/services/analytics.service';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { JwtAuthGuard } from '../../src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/modules/auth/guards/roles.gaurd';
import { AttemptStatus, GradingStatus } from '../../src/generated/prisma/client';

// ---------------------------------------------------------------------
// Seeded-cohort fixture — mirrors prisma/seeds/analytics-mock.ts
// ---------------------------------------------------------------------

const QUIZ_CLOSED = 'quiz-closed';
const QUIZ_OPEN = 'quiz-open';
const QUIZ_UNASSIGNED = 'quiz-unassigned';

const WINDOW_CLOSED_ENDS_AT = new Date('2026-08-01T18:00:00.000Z'); // in the past

const quizMetaById: Record<string, { id: string; title: string; endsAt: Date | null }> = {
  [QUIZ_CLOSED]: { id: QUIZ_CLOSED, title: 'Analytics Mock Quiz (Closed Window)', endsAt: WINDOW_CLOSED_ENDS_AT },
  [QUIZ_OPEN]: { id: QUIZ_OPEN, title: 'Analytics Mock Quiz (Open Window)', endsAt: null },
  [QUIZ_UNASSIGNED]: { id: QUIZ_UNASSIGNED, title: 'Analytics Mock Quiz (Unassigned)', endsAt: null },
};

const studentsByQuiz: Record<string, Array<{ userId: string; user: { name: string } }>> = {
  [QUIZ_CLOSED]: [
    { userId: 's-completed', user: { name: 'Completed Student' } },
    { userId: 's-zeroscore', user: { name: 'Zero Score Student' } },
    { userId: 's-followup', user: { name: 'Pending Review Student' } },
    { userId: 's-notcompleted', user: { name: 'Timed Out Student' } },
    { userId: 's-absent', user: { name: 'Absent Student' } },
  ],
  [QUIZ_OPEN]: [{ userId: 's-notstarted', user: { name: 'Not Started Student' } }],
  [QUIZ_UNASSIGNED]: [],
};

const attemptsByQuiz: Record<string, any[]> = {
  [QUIZ_CLOSED]: [
    {
      id: 'a-completed',
      studentId: 's-completed',
      status: AttemptStatus.SUBMITTED,
      startedAt: new Date('2026-08-01T10:00:00.000Z'),
      submittedAt: new Date('2026-08-01T10:18:00.000Z'),
      result: { score: 8, maxScore: 10, percentage: 80, gradingStatus: GradingStatus.COMPLETE, pendingEssayCount: 0 },
    },
    {
      id: 'a-zeroscore',
      studentId: 's-zeroscore',
      status: AttemptStatus.SUBMITTED,
      startedAt: new Date('2026-08-01T10:02:00.000Z'),
      submittedAt: new Date('2026-08-01T10:19:00.000Z'),
      result: { score: 0, maxScore: 10, percentage: 0, gradingStatus: GradingStatus.COMPLETE, pendingEssayCount: 0 },
    },
    {
      id: 'a-followup',
      studentId: 's-followup',
      status: AttemptStatus.SUBMITTED,
      startedAt: new Date('2026-08-01T10:05:00.000Z'),
      submittedAt: new Date('2026-08-01T10:24:00.000Z'),
      result: { score: 5, maxScore: 10, percentage: 50, gradingStatus: GradingStatus.PARTIAL, pendingEssayCount: 1 },
    },
    {
      id: 'a-notcompleted',
      studentId: 's-notcompleted',
      status: AttemptStatus.TIMED_OUT,
      startedAt: new Date('2026-08-01T10:10:00.000Z'),
      submittedAt: null,
      result: null,
    },
    // s-absent: deliberately zero Attempt rows.
  ],
  [QUIZ_OPEN]: [
    // s-notstarted: deliberately zero Attempt rows, window open.
  ],
  [QUIZ_UNASSIGNED]: [],
};

function buildSeededPrismaMock() {
  return {
    quiz: {
      findMany: jest.fn().mockResolvedValue(
        [QUIZ_CLOSED, QUIZ_OPEN, QUIZ_UNASSIGNED].map((id) => ({ id })),
      ),
      findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) => {
        const quiz = quizMetaById[id];
        return Promise.resolve(
          quiz
            ? { ...quiz, students: studentsByQuiz[id] }
            : null,
        );
      }),
    },
    attempt: {
      findMany: jest.fn(({ where }: { where: { quizId: string } }) =>
        Promise.resolve(attemptsByQuiz[where.quizId] ?? []),
      ),
    },
  };
}

async function buildApp(prismaMock: unknown): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    controllers: [AnalyticsController],
    providers: [
      AnalyticsService,
      { provide: PrismaService, useValue: prismaMock as PrismaService },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(RolesGuard)
    .useValue({ canActivate: () => true })
    .compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

describe('GET /analytics/dashboard — empty cohort', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp({
      quiz: { findMany: jest.fn().mockResolvedValue([]) },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns real zeros and null — never NaN, hardcoded, or a mock fallback', async () => {
    const response = await request(app.getHttpServer()).get('/api/analytics/dashboard');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
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
      scoreDistribution: [
        { range: '0-20', count: 0 },
        { range: '21-40', count: 0 },
        { range: '41-60', count: 0 },
        { range: '61-80', count: 0 },
        { range: '81-100', count: 0 },
      ],
      quizzes: [],
    });

    // Explicitly assert the honesty rule: no NaN anywhere in the payload.
    expect(JSON.stringify(response.body)).not.toContain('NaN');
  });
});

describe('GET /analytics/dashboard — seeded cohort (analytics-mock fixture)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp(buildSeededPrismaMock());
  });

  afterAll(async () => {
    await app.close();
  });

  it('aggregates participation, completion, absence, follow-up and score distribution correctly', async () => {
    const response = await request(app.getHttpServer()).get('/api/analytics/dashboard');

    expect(response.status).toBe(200);
    const body = response.body;

    expect(body.totalQuizzes).toBe(3);
    // 5 (closed) + 1 (open) + 0 (unassigned) = 6 distinct students.
    expect(body.distinctStudentCount).toBe(6);
    expect(body.assignedCount).toBe(6);
    // Participation: completed, zeroscore, followup, notcompleted (4) — absent and notstarted excluded.
    expect(body.participationCount).toBe(4);
    // Completion: completed, zeroscore, followup all resolve to COMPLETED/COMPLETED_PENDING_REVIEW.
    expect(body.completionCount).toBe(3);
    // Absence only counted once the window is closed: just s-absent.
    expect(body.absenceCount).toBe(1);
    // Follow-up: only the PARTIAL/pending-essay student.
    expect(body.followUpCount).toBe(1);
    expect(body.participationRate).toBeCloseTo(4 / 6, 5);
    expect(body.completionRate).toBeCloseTo(3 / 6, 5);
    // Average of percentages [80, 0, 50] across all completed students.
    expect(body.averageScore).toBeCloseTo((80 + 0 + 50) / 3, 5);

    const bucketCounts = Object.fromEntries(
      body.scoreDistribution.map((b: { range: string; count: number }) => [b.range, b.count]),
    );
    expect(bucketCounts).toEqual({ '0-20': 1, '21-40': 0, '41-60': 1, '61-80': 0, '81-100': 1 });

    expect(body.quizzes).toHaveLength(3);
    const closed = body.quizzes.find((q: { quizId: string }) => q.quizId === QUIZ_CLOSED);
    expect(closed).toMatchObject({
      windowClosed: true,
      assignedCount: 5,
      participationCount: 4,
      completionCount: 3,
      absenceCount: 1,
      followUpCount: 1,
    });

    const open = body.quizzes.find((q: { quizId: string }) => q.quizId === QUIZ_OPEN);
    expect(open).toMatchObject({
      windowClosed: false,
      assignedCount: 1,
      participationCount: 0,
      completionCount: 0,
      absenceCount: 0, // window still open — never conflated with participation failure
      followUpCount: 0,
      averageScore: null,
    });

    const unassigned = body.quizzes.find((q: { quizId: string }) => q.quizId === QUIZ_UNASSIGNED);
    expect(unassigned).toMatchObject({
      assignedCount: 0,
      participationRate: 0, // 0, not NaN, despite a 0/0 division
      completionRate: 0,
      averageScore: null,
    });
  });

  it('per-quiz student-metrics endpoint distinguishes ABSENT from NOT_STARTED (contract §4)', async () => {
    const closedResponse = await request(app.getHttpServer()).get(
      `/api/analytics/quizzes/${QUIZ_CLOSED}/student-metrics`,
    );
    const absentEntry = closedResponse.body.find((s: { studentId: string }) => s.studentId === 's-absent');
    expect(absentEntry.status).toBe('ABSENT');

    const openResponse = await request(app.getHttpServer()).get(
      `/api/analytics/quizzes/${QUIZ_OPEN}/student-metrics`,
    );
    const notStartedEntry = openResponse.body.find((s: { studentId: string }) => s.studentId === 's-notstarted');
    expect(notStartedEntry.status).toBe('NOT_STARTED');
  });
});
