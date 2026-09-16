import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AnalyticsController } from '../src/modules/analytics/controllers/analytics.controller';
import { AnalyticsService } from '../src/modules/analytics/services/analytics.service';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/modules/auth/guards/roles.gaurd';

describe('Analytics endpoint', () => {
  let app: INestApplication;
  const now = new Date('2026-06-10T00:00:00.000Z');
  const prismaMock = {
    quiz: {
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue({
        id: 'quiz_abc123',
        title: 'Sample Quiz',
      }),
      findFirst: jest.fn().mockResolvedValue({
        id: 'quiz_abc123',
        title: 'Sample Quiz',
      }),
    },
    user: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([
        { id: 'student_abc123', name: 'Student Name' },
      ]),
    },
    attempt: {
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _avg: { score: null } }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'attempt_abc123',
          studentId: 'student_abc123',
          score: 0,
          status: 'IN_PROGRESS',
          startedAt: now,
          submittedAt: now,
        },
      ]),
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: prismaMock as unknown as PrismaService },
      ],
    })
      // AnalyticsController is admin-gated (JwtAuthGuard + RolesGuard);
      // this suite only exercises AnalyticsService's business logic
      // through the controller, so auth is stubbed rather than tested
      // here (see test/analytics/ for the Sprint 2 endpoints).
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns analytics summary', async () => {
    const response = await request(app.getHttpServer()).get('/api/analytics');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      totalQuizzes: 0,
      totalStudents: 0,
      totalAttempts: 0,
      averageScore: 0,
    });
  });

  it('returns quiz attempts for a quiz id', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/analytics/quizzes/quiz_abc123/attempts',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      quizId: 'quiz_abc123',
      quizTitle: 'Sample Quiz',
      attemptCount: 1,
      completionCount: 0,
      averageScore: 0,
      statusBreakdown: {
        notStarted: 0,
        inProgress: 1,
        submitted: 0,
      },
      attempts: [],
      studentScores: [
        {
          studentId: 'student_abc123',
          studentName: 'Student Name',
          status: 'IN_PROGRESS',
          score: 0,
          attemptId: 'attempt_abc123',
          startedAt: now.toISOString(),
          submittedAt: now.toISOString(),
        },
      ],
    });
  });
});
