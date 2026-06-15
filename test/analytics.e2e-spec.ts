import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AnalyticsController } from '../src/modules/analytics/controllers/analytics.controller';
import { AnalyticsService } from '../src/modules/analytics/services/analytics.service';
import { PrismaService } from '../src/common/prisma/prisma.service';

describe('Analytics endpoint', () => {
  let app: INestApplication;
  const now = new Date('2026-06-10T00:00:00.000Z');
  const prismaMock = {
    quiz: {
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue({
        id: '11111111-1111-1111-1111-111111111111',
        title: 'Sample Quiz',
      }),
    },
    user: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([
        { id: '22222222-2222-2222-2222-222222222222', name: 'Student Name' },
      ]),
    },
    attempt: {
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _avg: { score: null } }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: '33333333-3333-3333-3333-333333333333',
          studentId: '22222222-2222-2222-2222-222222222222',
          score: 0,
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
    }).compile();

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
      '/api/analytics/quizzes/11111111-1111-1111-1111-111111111111/attempts',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      quizId: '11111111-1111-1111-1111-111111111111',
      quizTitle: 'Sample Quiz',
      attemptCount: 1,
      attempts: [
        {
          attemptId: '33333333-3333-3333-3333-333333333333',
          studentName: 'Student Name',
          score: 0,
          submittedAt: expect.any(String),
        },
      ],
    });
  });
});
