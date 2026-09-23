// test/analytics/question-quality.e2e-spec.ts
//
// Fixture is intentionally identical to the one hand-verified in
// docs/analytics-calculations.md §1 — "Algebra Basics" quiz, 2 questions,
// 5 students (A completes both correctly, B misses Q2, C misses both,
// D skips Q2, E skips both). If you change these numbers, update the
// doc's worked example to match, or the two stop being cross-checkable.

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { QuestionQualityController } from '../../src/modules/analytics/controllers/question-quality.controller';
import { QuestionQualityService } from '../../src/modules/analytics/services/question-quality.service';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { JwtAuthGuard } from '../../src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/modules/auth/guards/roles.gaurd';

const QUIZ_ID = 'quiz-calc-fixture';

const QUIZ_ROW = {
  id: QUIZ_ID,
  title: 'Algebra Basics',
  tags: ['algebra', 'midterm'],
  quizQuestions: [
    { questionId: 'q1-fixture', question: { id: 'q1-fixture', text: 'What is 7 x 8?' } },
    { questionId: 'q2-fixture', question: { id: 'q2-fixture', text: 'Solve for x: 2x = 10' } },
  ],
};

// A, B, C in cohort "2026-A"; D, E in cohort "2026-B" — used by the
// cohort-filter test below.
const ATTEMPTS = [
  { id: 'a-A', quizId: QUIZ_ID, cohort: '2026-A', answers: [
    { questionId: 'q1-fixture', isCorrect: true },
    { questionId: 'q2-fixture', isCorrect: true },
  ] },
  { id: 'a-B', quizId: QUIZ_ID, cohort: '2026-A', answers: [
    { questionId: 'q1-fixture', isCorrect: true },
    { questionId: 'q2-fixture', isCorrect: false },
  ] },
  { id: 'a-C', quizId: QUIZ_ID, cohort: '2026-A', answers: [
    { questionId: 'q1-fixture', isCorrect: false },
    { questionId: 'q2-fixture', isCorrect: false },
  ] },
  { id: 'a-D', quizId: QUIZ_ID, cohort: '2026-B', answers: [
    { questionId: 'q1-fixture', isCorrect: true },
    // Q2 skipped — no AttemptAnswer row at all.
  ] },
  { id: 'a-E', quizId: QUIZ_ID, cohort: '2026-B', answers: [
    // Both skipped.
  ] },
];

function buildPrismaMock() {
  return {
    quiz: {
      findMany: jest.fn(({ where }: { where: { id?: string; tags?: { hasSome: string[] } } }) => {
        if (where.id && where.id !== QUIZ_ID) return Promise.resolve([]);
        if (where.tags && !where.tags.hasSome.some((t) => QUIZ_ROW.tags.includes(t))) {
          return Promise.resolve([]);
        }
        return Promise.resolve([QUIZ_ROW]);
      }),
    },
    attempt: {
      findMany: jest.fn(({ where }: { where: { student?: { cohort?: string } } }) => {
        const cohortFilter = where.student?.cohort;
        const rows = ATTEMPTS.filter((a) => !cohortFilter || a.cohort === cohortFilter);
        return Promise.resolve(rows.map((a) => ({ id: a.id, quizId: a.quizId, answers: a.answers })));
      }),
    },
  };
}

async function buildApp(prismaMock: unknown): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    controllers: [QuestionQualityController],
    providers: [
      QuestionQualityService,
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

describe('GET /analytics/questions/quality — empty cohort', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp({ quiz: { findMany: jest.fn().mockResolvedValue([]) } });
  });

  afterAll(async () => app.close());

  it('returns zero questions, not an error or NaN', async () => {
    const response = await request(app.getHttpServer()).get('/api/analytics/questions/quality');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ totalQuestions: 0, questions: [] });
  });
});

describe('GET /analytics/questions/quality — seeded fixture', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp(buildPrismaMock());
  });

  afterAll(async () => app.close());

  it('computes correct/wrong/skip rates matching the hand-verified fixture and sorts hardest first', async () => {
    const response = await request(app.getHttpServer()).get('/api/analytics/questions/quality');
    expect(response.status).toBe(200);
    expect(response.body.totalQuestions).toBe(2);

    const [first, second] = response.body.questions;

    // Q2 is hardest (correctRate 0.2 < Q1's 0.6) — must sort first.
    expect(first.questionId).toBe('q2-fixture');
    expect(first).toMatchObject({
      totalFinalizedAttempts: 5,
      correctCount: 1,
      wrongCount: 2,
      skippedCount: 2,
      pendingGradingCount: 0,
      correctRate: 0.2,
      wrongRate: 0.4,
      skippedRate: 0.4,
      confusionScore: 0.6667,
    });

    expect(second.questionId).toBe('q1-fixture');
    expect(second).toMatchObject({
      totalFinalizedAttempts: 5,
      correctCount: 3,
      wrongCount: 1,
      skippedCount: 1,
      pendingGradingCount: 0,
      correctRate: 0.6,
      wrongRate: 0.2,
      skippedRate: 0.2,
      confusionScore: 0.25,
    });
  });

  it('applies the cohort filter identically to the shared filter contract', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/analytics/questions/quality?cohort=2026-B',
    );
    expect(response.status).toBe(200);
    // Cohort 2026-B is just D and E: Q1 correct=1(D), skipped=1(E);
    // Q2 skipped=2(D,E).
    const q1 = response.body.questions.find((q: { questionId: string }) => q.questionId === 'q1-fixture');
    expect(q1).toMatchObject({ totalFinalizedAttempts: 2, correctCount: 1, wrongCount: 0, skippedCount: 1 });
  });

  it('rejects an invalid date filter with 400 rather than silently ignoring it', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/analytics/questions/quality?dateFrom=not-a-date',
    );
    expect(response.status).toBe(400);
  });
});
