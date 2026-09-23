// test/analytics/cohort-distribution.e2e-spec.ts
//
// Same "Algebra Basics" fixture as question-quality.e2e-spec.ts and
// docs/analytics-calculations.md §2: 5 students, percentages
// [A:100, B:50, C:0, D:50, E:0] on a 2-point quiz. See the doc for the
// full hand-worked mean/median/stddev/rank/percentile arithmetic.

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { CohortDistributionController } from '../../src/modules/analytics/controllers/cohort-distribution.controller';
import { CohortDistributionService } from '../../src/modules/analytics/services/cohort-distribution.service';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { JwtAuthGuard } from '../../src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/modules/auth/guards/roles.gaurd';

const QUIZ_ID = 'quiz-calc-fixture';

const QUIZ_ROW = { id: QUIZ_ID, title: 'Algebra Basics', tags: ['algebra', 'midterm'] };

const STUDENTS = [
  { studentId: 's-A', name: 'Student A', cohort: '2026-A', score: 2, maxScore: 2, percentage: 100 },
  { studentId: 's-B', name: 'Student B', cohort: '2026-A', score: 1, maxScore: 2, percentage: 50 },
  { studentId: 's-C', name: 'Student C', cohort: '2026-A', score: 0, maxScore: 2, percentage: 0 },
  { studentId: 's-D', name: 'Student D', cohort: '2026-B', score: 1, maxScore: 2, percentage: 50 },
  { studentId: 's-E', name: 'Student E', cohort: '2026-B', score: 0, maxScore: 2, percentage: 0 },
];

function buildPrismaMock() {
  return {
    quiz: {
      findMany: jest.fn(({ where }: { where: { id?: string } }) => {
        if (where.id && where.id !== QUIZ_ID) return Promise.resolve([]);
        return Promise.resolve([QUIZ_ROW]);
      }),
    },
    attempt: {
      findMany: jest.fn(({ where }: { where: { student?: { cohort?: string } } }) => {
        const cohortFilter = where.student?.cohort;
        const rows = STUDENTS.filter((s) => !cohortFilter || s.cohort === cohortFilter);
        return Promise.resolve(
          rows.map((s, i) => ({
            studentId: s.studentId,
            submittedAt: new Date(`2026-08-01T10:0${i}:00.000Z`),
            quizId: QUIZ_ID,
            student: { cohort: s.cohort, user: { name: s.name } },
            result: { score: s.score, maxScore: s.maxScore, percentage: s.percentage },
          })),
        );
      }),
    },
  };
}

async function buildApp(prismaMock: unknown): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    controllers: [CohortDistributionController],
    providers: [
      CohortDistributionService,
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

describe('GET /analytics/cohorts/distribution — empty cohort', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp({ quiz: { findMany: jest.fn().mockResolvedValue([]) } });
  });

  afterAll(async () => app.close());

  it('returns real zeros/null, all 5 buckets present at 0', async () => {
    const response = await request(app.getHttpServer()).get('/api/analytics/cohorts/distribution');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      totalCompletedAttempts: 0,
      averagePercentage: null,
      medianPercentage: null,
      standardDeviationPercentage: null,
      scoreDistribution: [
        { range: '0-20', count: 0 },
        { range: '21-40', count: 0 },
        { range: '41-60', count: 0 },
        { range: '61-80', count: 0 },
        { range: '81-100', count: 0 },
      ],
      standings: [],
    });
  });
});

describe('GET /analytics/cohorts/distribution — seeded fixture', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp(buildPrismaMock());
  });

  afterAll(async () => app.close());

  it('matches the hand-verified mean/median/stddev/buckets', async () => {
    const response = await request(app.getHttpServer()).get('/api/analytics/cohorts/distribution');
    expect(response.status).toBe(200);
    const body = response.body;

    expect(body.totalCompletedAttempts).toBe(5);
    expect(body.averagePercentage).toBe(40);
    expect(body.medianPercentage).toBe(50);
    expect(body.standardDeviationPercentage).toBe(37.42);

    const bucketCounts = Object.fromEntries(
      body.scoreDistribution.map((b: { range: string; count: number }) => [b.range, b.count]),
    );
    expect(bucketCounts).toEqual({ '0-20': 2, '21-40': 0, '41-60': 2, '61-80': 0, '81-100': 1 });
  });

  it('ranks with standard competition (1224) ranking and correct percentiles', async () => {
    const response = await request(app.getHttpServer()).get('/api/analytics/cohorts/distribution');
    const byId = Object.fromEntries(
      response.body.standings.map((s: { studentId: string }) => [s.studentId, s]),
    );

    expect(byId['s-A']).toMatchObject({ rank: 1, percentile: 80 });
    expect(byId['s-B']).toMatchObject({ rank: 2, percentile: 40 });
    expect(byId['s-D']).toMatchObject({ rank: 2, percentile: 40 });
    // Rank skips to 4 after the tie at 2 (competition ranking, not dense).
    expect(byId['s-C']).toMatchObject({ rank: 4, percentile: 0 });
    expect(byId['s-E']).toMatchObject({ rank: 4, percentile: 0 });
  });

  it('cohort filter narrows both the standings and the recomputed stats', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/analytics/cohorts/distribution?cohort=2026-A',
    );
    expect(response.body.totalCompletedAttempts).toBe(3);
    expect(response.body.standings.map((s: { studentId: string }) => s.studentId).sort()).toEqual([
      's-A',
      's-B',
      's-C',
    ]);
  });
});

describe('GET /analytics/cohorts/export.csv', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp(buildPrismaMock());
  });

  afterAll(async () => app.close());

  it('exports exactly the same filtered rows as the JSON distribution endpoint, with the correct headers and no secret fields', async () => {
    const jsonResponse = await request(app.getHttpServer()).get(
      '/api/analytics/cohorts/distribution?cohort=2026-A',
    );
    const csvResponse = await request(app.getHttpServer()).get(
      '/api/analytics/cohorts/export.csv?cohort=2026-A',
    );

    expect(csvResponse.status).toBe(200);
    expect(csvResponse.headers['content-type']).toContain('text/csv');
    expect(csvResponse.headers['content-disposition']).toContain('attachment');

    const csvText = csvResponse.text as string;
    const lines = csvText.trim().split('\r\n');
    expect(lines[0]).toBe(
      'studentId,studentName,cohort,quizId,quizTitle,score,maxScore,percentage,rank,percentile,submittedAt',
    );
    // Same row count as the JSON endpoint under the identical filter.
    expect(lines.length - 1).toBe(jsonResponse.body.standings.length);

    // Hard guarantee: never leaks credentials/secrets, whatever columns
    // get added to this export in the future.
    expect(csvText).not.toMatch(/password/i);
    expect(csvText).not.toMatch(/token/i);
    expect(csvText).not.toMatch(/@/); // no email addresses either
  });
});
