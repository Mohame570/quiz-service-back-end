import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AnalyticsController } from '../src/modules/analytics/controllers/analytics.controller';
import { AnalyticsService } from '../src/modules/analytics/services/analytics.service';
import { PrismaService } from '../src/common/prisma/prisma.service';

describe('Analytics endpoint', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: {} as PrismaService },
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
      '/api/analytics/quizzes/1/attempts',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      quizId: 1,
      quizTitle: 'Sample Quiz',
      attemptCount: 1,
      attempts: [
        {
          attemptId: 0,
          studentName: 'Student Name',
          score: 0,
          submittedAt: expect.any(String),
        },
      ],
    });
  });
});
