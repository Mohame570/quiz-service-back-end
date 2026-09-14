// test/analytics/follow-up.e2e-spec.ts
//
// Covers docs/analytics-contract.md §15 (GET /follow-up, GET
// /follow-up/quizzes/:quizId):
//   1. Empty cohort — zero quizzes must still return all 6 category
//      groups at count 0, never an empty/omitted list.
//   2. Seeded cohort — one quiz built to trigger every one of the 6
//      categories simultaneously (pending essay review, at-risk low
//      score, stalled in-progress, abandoned, absent, not-started
//      closing soon), verifying each student lands in exactly the
//      right bucket with a non-empty reason and recommended action.

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { FollowUpController } from '../../src/modules/follow-up/controllers/follow-up.controller';
import { FollowUpService } from '../../src/modules/follow-up/services/follow-up.service';
import { AnalyticsService } from '../../src/modules/analytics/services/analytics.service';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { JwtAuthGuard } from '../../src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/modules/auth/guards/roles.gaurd';
import { FollowUpCategory } from '../../src/modules/follow-up/dto/follow-up.dto';

const QUIZ_ID = 'quiz-followup-demo';
const ALL_CATEGORIES = [
  FollowUpCategory.PENDING_ESSAY_REVIEW,
  FollowUpCategory.AT_RISK_LOW_SCORE,
  FollowUpCategory.STALLED_IN_PROGRESS,
  FollowUpCategory.ABANDONED_NOT_COMPLETED,
  FollowUpCategory.ABSENT_NO_SHOW,
  FollowUpCategory.NOT_STARTED_CLOSING_SOON,
];

async function buildApp(prismaMock: unknown): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    controllers: [FollowUpController],
    providers: [
      FollowUpService,
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

describe('GET /follow-up — empty cohort', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp({
      quiz: { findMany: jest.fn().mockResolvedValue([]) },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns all 6 category groups at count 0 — never an omitted bucket', async () => {
    const response = await request(app.getHttpServer()).get('/api/follow-up');

    expect(response.status).toBe(200);
    expect(response.body.totalFollowUps).toBe(0);
    expect(response.body.categories).toHaveLength(6);
    expect(
      response.body.categories.every((c: { count: number; entries: unknown[] }) => c.count === 0 && c.entries.length === 0),
    ).toBe(true);
    expect(response.body.categories.map((c: { category: string }) => c.category).sort()).toEqual(
      [...ALL_CATEGORIES].sort(),
    );
  });
});

describe('GET /follow-up — seeded cohort exercising every category', () => {
  // ABSENT requires a closed window; NOT_STARTED_CLOSING_SOON requires an
  // open one closing soon — mutually exclusive on a single quiz, so this
  // fixture uses two quizzes (mirroring analytics-mock.ts's two-quiz
  // closed/open split) and exercises the org-wide GET /follow-up endpoint.
  let app: INestApplication;
  const now = new Date();
  const QUIZ_CLOSED = QUIZ_ID;
  const QUIZ_CLOSING_SOON = 'quiz-followup-closing-soon';
  const quizEndsAtSoon = new Date(now.getTime() + 6 * 60 * 60 * 1000); // closes in 6h — inside 24h window

  const students = [
    { userId: 's-pending-essay', user: { name: 'Pending Essay Student' } },
    { userId: 's-low-score', user: { name: 'Low Score Student' } },
    { userId: 's-stalled', user: { name: 'Stalled Student' } },
    { userId: 's-abandoned', user: { name: 'Abandoned Student' } },
    { userId: 's-absent', user: { name: 'Absent Student' } },
    { userId: 's-healthy', user: { name: 'Healthy Student' } },
  ];
  const closingSoonStudents = [{ userId: 's-closing-soon', user: { name: 'Closing Soon Student' } }];

  const attempts = [
    {
      id: 'a-pending-essay',
      studentId: 's-pending-essay',
      status: 'SUBMITTED',
      startedAt: new Date(now.getTime() - 60 * 60 * 1000),
      submittedAt: new Date(now.getTime() - 50 * 60 * 1000),
      result: { score: 5, maxScore: 10, percentage: 50, gradingStatus: 'PARTIAL', pendingEssayCount: 1 },
    },
    {
      id: 'a-low-score',
      studentId: 's-low-score',
      status: 'SUBMITTED',
      startedAt: new Date(now.getTime() - 60 * 60 * 1000),
      submittedAt: new Date(now.getTime() - 50 * 60 * 1000),
      result: { score: 3, maxScore: 10, percentage: 30, gradingStatus: 'COMPLETE', pendingEssayCount: 0 },
    },
    {
      id: 'a-stalled',
      studentId: 's-stalled',
      status: 'IN_PROGRESS',
      startedAt: new Date(now.getTime() - 5 * 60 * 60 * 1000),
      submittedAt: null,
      result: null,
    },
    {
      id: 'a-abandoned',
      studentId: 's-abandoned',
      status: 'TIMED_OUT',
      startedAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
      submittedAt: null,
      result: null,
    },
    // s-absent: zero attempts, window closed.
    // s-closing-soon: zero attempts, window open but closing within 24h.
    {
      id: 'a-healthy',
      studentId: 's-healthy',
      status: 'SUBMITTED',
      startedAt: new Date(now.getTime() - 60 * 60 * 1000),
      submittedAt: new Date(now.getTime() - 50 * 60 * 1000),
      result: { score: 9, maxScore: 10, percentage: 90, gradingStatus: 'COMPLETE', pendingEssayCount: 0 },
    },
  ];

  // s-stalled's attempt expired an hour ago but was never finalized —
  // this is what distinguishes STALLED_IN_PROGRESS from an attempt
  // still actively within its time window.
  const stalledExpiresAt = new Date(now.getTime() - 60 * 60 * 1000);

  const quizMetaById: Record<string, any> = {
    [QUIZ_CLOSED]: {
      id: QUIZ_CLOSED,
      title: 'Follow-Up Demo Quiz (Closed)',
      endsAt: new Date(now.getTime() - 60 * 60 * 1000), // closed an hour ago
      passingScore: 60,
      students,
    },
    [QUIZ_CLOSING_SOON]: {
      id: QUIZ_CLOSING_SOON,
      title: 'Follow-Up Demo Quiz (Closing Soon)',
      endsAt: quizEndsAtSoon,
      passingScore: 60,
      students: closingSoonStudents,
    },
  };

  const attemptsByQuiz: Record<string, any[]> = {
    [QUIZ_CLOSED]: attempts,
    [QUIZ_CLOSING_SOON]: [], // s-closing-soon has zero attempts
  };

  beforeAll(async () => {
    const prismaMock = {
      quiz: {
        // getFollowUpQueue() selects {id, title, endsAt, passingScore}
        // directly off findMany — must match quiz.findUnique's shape.
        findMany: jest.fn().mockResolvedValue([
          quizMetaById[QUIZ_CLOSED],
          quizMetaById[QUIZ_CLOSING_SOON],
        ]),
        findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve(quizMetaById[id] ?? null),
        ),
      },
      attempt: {
        findMany: jest.fn((args: { where: { quizId?: string; id?: { in: string[] } } }) => {
          // AnalyticsService.getStudentQuizMetrics query (filtered by quizId + studentId)
          if (args.where.quizId) {
            return Promise.resolve(attemptsByQuiz[args.where.quizId] ?? []);
          }
          // FollowUpService's expiresAt lookup for IN_PROGRESS attempts
          if (args.where.id) {
            return Promise.resolve([{ id: 'a-stalled', expiresAt: stalledExpiresAt }]);
          }
          return Promise.resolve([]);
        }),
      },
    };
    app = await buildApp(prismaMock);
  });

  afterAll(async () => {
    await app.close();
  });

  it('categorizes each student into exactly the right bucket with a reason and action', async () => {
    const response = await request(app.getHttpServer()).get('/api/follow-up');

    expect(response.status).toBe(200);
    const body = response.body;
    expect(body.categories).toHaveLength(6);

    const byCategory = Object.fromEntries(
      body.categories.map((c: { category: string; entries: any[] }) => [c.category, c.entries]),
    );

    expect(byCategory[FollowUpCategory.PENDING_ESSAY_REVIEW]).toHaveLength(1);
    expect(byCategory[FollowUpCategory.PENDING_ESSAY_REVIEW][0].studentId).toBe('s-pending-essay');

    expect(byCategory[FollowUpCategory.AT_RISK_LOW_SCORE]).toHaveLength(1);
    expect(byCategory[FollowUpCategory.AT_RISK_LOW_SCORE][0].studentId).toBe('s-low-score');

    expect(byCategory[FollowUpCategory.STALLED_IN_PROGRESS]).toHaveLength(1);
    expect(byCategory[FollowUpCategory.STALLED_IN_PROGRESS][0].studentId).toBe('s-stalled');

    expect(byCategory[FollowUpCategory.ABANDONED_NOT_COMPLETED]).toHaveLength(1);
    expect(byCategory[FollowUpCategory.ABANDONED_NOT_COMPLETED][0].studentId).toBe('s-abandoned');

    expect(byCategory[FollowUpCategory.ABSENT_NO_SHOW]).toHaveLength(1);
    expect(byCategory[FollowUpCategory.ABSENT_NO_SHOW][0].studentId).toBe('s-absent');

    expect(byCategory[FollowUpCategory.NOT_STARTED_CLOSING_SOON]).toHaveLength(1);
    expect(byCategory[FollowUpCategory.NOT_STARTED_CLOSING_SOON][0].studentId).toBe('s-closing-soon');

    // s-healthy (90%, COMPLETED, above threshold) must not appear anywhere.
    expect(body.totalFollowUps).toBe(6);
    const allFlaggedIds = body.categories.flatMap((c: { entries: any[] }) => c.entries.map((e) => e.studentId));
    expect(allFlaggedIds).not.toContain('s-healthy');

    // Every flagged entry must carry a non-empty reason and recommended action.
    for (const entry of body.categories.flatMap((c: { entries: any[] }) => c.entries)) {
      expect(typeof entry.reason).toBe('string');
      expect(entry.reason.length).toBeGreaterThan(0);
      expect(typeof entry.recommendedAction).toBe('string');
      expect(entry.recommendedAction.length).toBeGreaterThan(0);
    }
  });
});
