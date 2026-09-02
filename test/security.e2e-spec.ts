import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';

describe('Admin endpoint security (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const ADMINUSER = {
    sub: 'admin-1',
    email: 'admin@test.com',
    role: 'ADMIN',
  };

  const STUDENTUSER = {
    sub: 'student-1',
    email: 'student@test.com',
    role: 'STUDENT',
  };
  const mockPrismaService = {
    quiz: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 'quiz-1', title: 'Mock Quiz' }),
    },
    question: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    emailDeliveryLog: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'delivery-log-1',
        status: 'FAILED',
        metadata: {},
      }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn().mockResolvedValue([[], 0]),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();

    app.setGlobalPrefix('api');

    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidUnknownValues: false,
      }),
    );

    await app.init();

    jwtService = app.get<JwtService>(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Quiz Module Endpoints', () => {
    const ENDPOINT = '/api/admin/quizzes';

    it('/admin/quizzes (POST) - Unauthorized without JWT', async () => {
      const response = await request(app.getHttpServer()).post(ENDPOINT);

      expect(response.status).toBe(401);
    });

    it('/admin/quizzes (POST) - Forbidden for STUDENT role', async () => {
      const studentToken = jwtService.sign(STUDENTUSER);

      const response = await request(app.getHttpServer())
        .post(ENDPOINT)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Security Test Quiz',
          description: 'Testing authorization',
          durationMinutes: 30,
          passingScore: 70,
        });

      expect(response.status).toBe(403);
    });

    it('/admin/quizzes (GET) - Success for ADMIN role', async () => {
      const adminToken = jwtService.sign(ADMINUSER);

      const response = await request(app.getHttpServer())
        .get(ENDPOINT)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });
  });

  describe('Questions Module Endpoints', () => {
    const ENDPOINT = '/api/questions';

    it('/questions (GET) - Success for ADMIN role', async () => {
      const adminToken = jwtService.sign(ADMINUSER);

      const response = await request(app.getHttpServer())
        .get(ENDPOINT)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });

    it('/questions (GET) - Unauthorized without JWT', async () => {
      const response = await request(app.getHttpServer()).get(ENDPOINT);

      expect(response.status).toBe(401);
    });

    it('/questions (GET) - Forbidden for STUDENT role', async () => {
      const studentToken = jwtService.sign(STUDENTUSER);

      const response = await request(app.getHttpServer())
        .get(ENDPOINT)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('Notification Admin Endpoints', () => {
    const DELIVERY_SUMMARY_ENDPOINT =
      '/api/admin/notifications/delivery-summary';

    const RESEND_ENDPOINT =
      '/api/notifications/delivery-logs/delivery-log-1/resend';

    it('/admin/notifications/delivery-summary (GET) - Unauthorized without JWT', async () => {
      const response = await request(app.getHttpServer()).get(
        DELIVERY_SUMMARY_ENDPOINT,
      );

      expect(response.status).toBe(401);
    });

    it('/admin/notifications/delivery-summary (GET) - Forbidden for STUDENT role', async () => {
      const studentToken = jwtService.sign(STUDENTUSER);

      const response = await request(app.getHttpServer())
        .get(DELIVERY_SUMMARY_ENDPOINT)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(403);
    });

    it('/admin/notifications/delivery-summary (GET) - Success for ADMIN role', async () => {
      const adminToken = jwtService.sign(ADMINUSER);

      const response = await request(app.getHttpServer())
        .get(DELIVERY_SUMMARY_ENDPOINT)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });

    it('/notifications/delivery-logs/:id/resend (POST) - Unauthorized without JWT', async () => {
      const response = await request(app.getHttpServer()).post(RESEND_ENDPOINT);

      expect(response.status).toBe(401);
    });

    it('/notifications/delivery-logs/:id/resend (POST) - Forbidden for STUDENT role', async () => {
      const studentToken = jwtService.sign(STUDENTUSER);

      const response = await request(app.getHttpServer())
        .post(RESEND_ENDPOINT)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(403);
    });

    it('/notifications/delivery-logs/:id/resend (POST) - Success for ADMIN role', async () => {
      const adminToken = jwtService.sign(ADMINUSER);

      const response = await request(app.getHttpServer())
        .post(RESEND_ENDPOINT)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });
  });
});
