import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';

import { PrismaService } from '../src/common/prisma/prisma.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { SettingsModule } from '../src/modules/settings/settings.module';
import { QuizModule } from '../src/modules/quiz/quiz.module';

describe('Settings & Unified Operations E2E', () => {
  let app: INestApplication;
  let currentUser: { sub: string; role: string } | null = {
    sub: 'admin-1',
    role: 'ADMIN',
  };

  const defaultSettingsRecord = {
    id: 'default',
    organizationName: 'PitIQ',
    timezoneLabel: 'UTC',
    defaultPassThreshold: 50,
    defaultDurationMinutes: 60,
    integrityReviewThreshold: 3,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  let currentSettings = { ...defaultSettingsRecord };

  const prismaMock = {
    organizationSettings: {
      upsert: jest.fn().mockImplementation((args: any) => {
        currentSettings = {
          ...currentSettings,
          ...(args?.update ?? {}),
        };
        return Promise.resolve(currentSettings);
      }),
      findFirst: jest.fn().mockImplementation(() => Promise.resolve(currentSettings)),
      update: jest.fn().mockImplementation(({ data }) => {
        currentSettings = { ...currentSettings, ...data };
        return Promise.resolve(currentSettings);
      }),
    },
    quiz: {
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'quiz-new-1',
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      findUnique: jest.fn(),
    },
    question: {
      findMany: jest.fn(),
    },
    quizQuestion: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true }),
        SettingsModule,
        QuizModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          if (!currentUser) {
            return false;
          }
          ctx.switchToHttp().getRequest().user = currentUser;
          return true;
        },
      })
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
  });

  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = { sub: 'admin-1', role: 'ADMIN' };
    currentSettings = { ...defaultSettingsRecord };
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Settings CRUD & Persistence', () => {
    it('GET /api/admin/settings returns default institutional settings on initial call', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/settings')
        .expect(200);

      expect(res.body.organizationName).toBe('PitIQ');
      expect(res.body.timezoneLabel).toBe('UTC');
      expect(res.body.defaultPassThreshold).toBe(50);
      expect(res.body.defaultDurationMinutes).toBe(60);
      expect(res.body.integrityReviewThreshold).toBe(3);
    });

    it('PATCH /api/admin/settings updates settings fields and persists them', async () => {
      const updatePayload = {
        organizationName: 'Global Assessment Academy',
        timezoneLabel: 'Africa/Cairo (EET)',
        defaultPassThreshold: 65,
        defaultDurationMinutes: 90,
        integrityReviewThreshold: 5,
      };

      const patchRes = await request(app.getHttpServer())
        .patch('/api/admin/settings')
        .send(updatePayload)
        .expect(200);

      expect(patchRes.body.organizationName).toBe('Global Assessment Academy');
      expect(patchRes.body.timezoneLabel).toBe('Africa/Cairo (EET)');
      expect(patchRes.body.defaultPassThreshold).toBe(65);
      expect(patchRes.body.defaultDurationMinutes).toBe(90);
      expect(patchRes.body.integrityReviewThreshold).toBe(5);

      // Verify subsequent GET returns the updated values
      const getRes = await request(app.getHttpServer())
        .get('/api/admin/settings')
        .expect(200);

      expect(getRes.body.organizationName).toBe('Global Assessment Academy');
      expect(getRes.body.timezoneLabel).toBe('Africa/Cairo (EET)');
      expect(getRes.body.defaultPassThreshold).toBe(65);
    });

    it('PATCH /api/admin/settings validates invalid numeric ranges', async () => {
      // Pass threshold cannot exceed 100
      await request(app.getHttpServer())
        .patch('/api/admin/settings')
        .send({ defaultPassThreshold: 150 })
        .expect(400);

      // Duration cannot be less than 1
      await request(app.getHttpServer())
        .patch('/api/admin/settings')
        .send({ defaultDurationMinutes: 0 })
        .expect(400);
    });

    it('GET /api/settings/public returns organizationName and timezoneLabel without requiring admin role', async () => {
      currentUser = null; // Unauthenticated

      const res = await request(app.getHttpServer())
        .get('/api/settings/public')
        .expect(200);

      expect(res.body.organizationName).toBeDefined();
      expect(res.body.timezoneLabel).toBeDefined();
      // Should NOT expose internal admin thresholds
      expect(res.body.defaultPassThreshold).toBeUndefined();
      expect(res.body.integrityReviewThreshold).toBeUndefined();
    });
  });

  describe('Admin Role Guard Enforcement', () => {
    it('GET /api/admin/settings with STUDENT role returns 403 Forbidden', async () => {
      currentUser = { sub: 'student-1', role: 'STUDENT' };

      await request(app.getHttpServer())
        .get('/api/admin/settings')
        .expect(403);
    });

    it('PATCH /api/admin/settings with STUDENT role returns 403 Forbidden', async () => {
      currentUser = { sub: 'student-1', role: 'STUDENT' };

      await request(app.getHttpServer())
        .patch('/api/admin/settings')
        .send({ organizationName: 'Hacked Org' })
        .expect(403);
    });

    it('GET /api/admin/settings without authentication returns 403 (guarded)', async () => {
      currentUser = null;

      await request(app.getHttpServer())
        .get('/api/admin/settings')
        .expect(403);
    });
  });

  describe('Default Propagation into Quiz Records', () => {
    it('creates quiz inheriting duration and pass threshold from settings when omitted', async () => {
      currentSettings = {
        ...defaultSettingsRecord,
        defaultPassThreshold: 75,
        defaultDurationMinutes: 45,
      };

      await request(app.getHttpServer())
        .post('/api/admin/quizzes')
        .send({
          title: 'Auto-defaulted Quiz',
          description: 'Testing inheritance',
          status: 'draft',
          createdById: 'admin-1',
        })
        .expect(201);

      expect(prismaMock.quiz.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Auto-defaulted Quiz',
            durationMinutes: 45,
            passingScore: 75,
          }),
        }),
      );
    });

    it('creates quiz with explicit duration and passingScore overriding settings defaults', async () => {
      currentSettings = {
        ...defaultSettingsRecord,
        defaultPassThreshold: 75,
        defaultDurationMinutes: 45,
      };

      await request(app.getHttpServer())
        .post('/api/admin/quizzes')
        .send({
          title: 'Custom Override Quiz',
          description: 'Testing explicit values',
          status: 'draft',
          durationMinutes: 120,
          passingScore: 90,
          createdById: 'admin-1',
        })
        .expect(201);

      expect(prismaMock.quiz.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Custom Override Quiz',
            durationMinutes: 120,
            passingScore: 90,
          }),
        }),
      );
    });
  });
});
