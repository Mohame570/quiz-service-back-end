import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { PrismaService } from '../src/common/prisma/prisma.service';
import { QuizModule } from '../src/modules/quiz/quiz.module';

describe('Quiz admin endpoints', () => {
  let app: INestApplication;

  const prismaMock = {
    quiz: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    question: {
      count: jest.fn(),
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [QuizModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
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
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('creates a draft quiz through the shared Prisma service', async () => {
    prismaMock.quiz.create.mockResolvedValueOnce({
      id: 'quiz-1',
      title: 'Sprint 1 Quiz',
      description: 'Admin-created quiz',
      status: 'DRAFT',
      durationMinutes: 45,
      passingScore: 80,
      startsAt: '2026-06-15T00:00:00.000Z',
      endsAt: '2026-06-20T00:00:00.000Z',
      createdById: 'admin-1',
      createdAt: '2026-06-10T00:00:00.000Z',
      updatedAt: '2026-06-10T00:00:00.000Z',
    });

    const response = await request(app.getHttpServer())
      .post('/api/admin/quizzes')
      .send({
        title: 'Sprint 1 Quiz',
        description: 'Admin-created quiz',
        status: 'draft',
        durationMinutes: 45,
        passingScore: 80,
        startsAt: '2026-06-15T00:00:00Z',
        endsAt: '2026-06-20T00:00:00Z',
        createdById: 'admin-1',
      });

    expect(response.status).toBe(201);
    expect(prismaMock.quiz.create).toHaveBeenCalledWith({
      data: {
        title: 'Sprint 1 Quiz',
        description: 'Admin-created quiz',
        status: 'DRAFT',
        durationMinutes: 45,
        passingScore: 80,
        startsAt: new Date('2026-06-15T00:00:00Z'),
        endsAt: new Date('2026-06-20T00:00:00Z'),
        createdById: 'admin-1',
      },
    });
    expect(response.body.status).toBe('DRAFT');
  });

  it('rejects creating a quiz as published because it has no questions yet', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/admin/quizzes')
      .send({
        title: 'Sprint 1 Quiz',
        status: 'published',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain(
      'A new quiz cannot be created as published',
    );
    expect(prismaMock.quiz.create).not.toHaveBeenCalled();
  });

  it('rejects an empty title according to the DTO validation contract', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/admin/quizzes')
      .send({
        title: '',
      });

    expect(response.status).toBe(400);
    expect(prismaMock.quiz.create).not.toHaveBeenCalled();
  });

  it('updates a quiz status through the admin patch endpoint', async () => {
    prismaMock.quiz.findUnique.mockResolvedValueOnce({
      id: 'quiz-1',
    });
    prismaMock.question.count.mockResolvedValueOnce(1);
    prismaMock.quiz.update.mockResolvedValueOnce({
      id: 'quiz-1',
      title: 'Sprint 1 Quiz',
      description: null,
      status: 'PUBLISHED',
      durationMinutes: null,
      passingScore: null,
      startsAt: null,
      endsAt: null,
      createdById: null,
      createdAt: '2026-06-10T00:00:00.000Z',
      updatedAt: '2026-06-10T00:00:00.000Z',
    });

    const response = await request(app.getHttpServer())
      .patch('/api/admin/quizzes/quiz-1')
      .send({
        status: 'Published',
      });

    expect(response.status).toBe(200);
    expect(prismaMock.question.count).toHaveBeenCalledWith({
      where: { quizId: 'quiz-1' },
    });
    expect(prismaMock.quiz.update).toHaveBeenCalledWith({
      where: { id: 'quiz-1' },
      data: {
        status: 'PUBLISHED',
      },
    });
  });

  it('rejects patching a quiz to published when it has no questions', async () => {
    prismaMock.quiz.findUnique.mockResolvedValueOnce({
      id: 'quiz-1',
    });
    prismaMock.question.count.mockResolvedValueOnce(0);

    const response = await request(app.getHttpServer())
      .patch('/api/admin/quizzes/quiz-1')
      .send({
        status: 'published',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain(
      'Quiz must have at least one question',
    );
    expect(prismaMock.quiz.update).not.toHaveBeenCalled();
  });

  it('updates a quiz to draft without checking question count', async () => {
    prismaMock.quiz.findUnique.mockResolvedValueOnce({
      id: 'quiz-1',
    });
    prismaMock.quiz.update.mockResolvedValueOnce({
      id: 'quiz-1',
      title: 'Sprint 1 Quiz',
      description: null,
      status: 'DRAFT',
      durationMinutes: null,
      passingScore: null,
      startsAt: null,
      endsAt: null,
      createdById: null,
      createdAt: '2026-06-10T00:00:00.000Z',
      updatedAt: '2026-06-10T00:00:00.000Z',
    });

    const response = await request(app.getHttpServer())
      .patch('/api/admin/quizzes/quiz-1')
      .send({
        status: 'draft',
      });

    expect(response.status).toBe(200);
    expect(prismaMock.question.count).not.toHaveBeenCalled();
    expect(prismaMock.quiz.update).toHaveBeenCalledWith({
      where: { id: 'quiz-1' },
      data: {
        status: 'DRAFT',
      },
    });
  });

  it('updates non-status quiz fields without checking question count', async () => {
    prismaMock.quiz.findUnique.mockResolvedValueOnce({
      id: 'quiz-1',
    });
    prismaMock.quiz.update.mockResolvedValueOnce({
      id: 'quiz-1',
      title: 'Updated Quiz',
      description: null,
      status: 'DRAFT',
      durationMinutes: null,
      passingScore: null,
      startsAt: null,
      endsAt: null,
      createdById: null,
      createdAt: '2026-06-10T00:00:00.000Z',
      updatedAt: '2026-06-10T00:00:00.000Z',
    });

    const response = await request(app.getHttpServer())
      .patch('/api/admin/quizzes/quiz-1')
      .send({
        title: 'Updated Quiz',
      });

    expect(response.status).toBe(200);
    expect(prismaMock.question.count).not.toHaveBeenCalled();
    expect(prismaMock.quiz.update).toHaveBeenCalledWith({
      where: { id: 'quiz-1' },
      data: {
        title: 'Updated Quiz',
      },
    });
  });

  it('publishes a quiz when it has at least one question', async () => {
    prismaMock.quiz.findUnique.mockResolvedValueOnce({
      id: 'quiz-1',
    });
    prismaMock.question.count.mockResolvedValueOnce(1);
    prismaMock.quiz.update.mockResolvedValueOnce({
      id: 'quiz-1',
      title: 'Sprint 1 Quiz',
      description: null,
      status: 'PUBLISHED',
      durationMinutes: null,
      passingScore: null,
      startsAt: null,
      endsAt: null,
      createdById: null,
      createdAt: '2026-06-10T00:00:00.000Z',
      updatedAt: '2026-06-10T00:00:00.000Z',
    });

    const response = await request(app.getHttpServer()).post(
      '/api/admin/quizzes/quiz-1/publish',
    );

    expect(response.status).toBe(200);
    expect(prismaMock.question.count).toHaveBeenCalledWith({
      where: { quizId: 'quiz-1' },
    });
    expect(prismaMock.quiz.update).toHaveBeenCalledWith({
      where: { id: 'quiz-1' },
      data: {
        status: 'PUBLISHED',
      },
    });
    expect(response.body.status).toBe('PUBLISHED');
  });

  it('rejects publishing a quiz with no questions', async () => {
    prismaMock.quiz.findUnique.mockResolvedValueOnce({
      id: 'quiz-1',
    });
    prismaMock.question.count.mockResolvedValueOnce(0);

    const response = await request(app.getHttpServer()).post(
      '/api/admin/quizzes/quiz-1/publish',
    );

    expect(response.status).toBe(400);
    expect(response.body.message).toContain(
      'Quiz must have at least one question',
    );
    expect(prismaMock.quiz.update).not.toHaveBeenCalled();
  });

  it('returns 404 when publishing a quiz that does not exist', async () => {
    prismaMock.quiz.findUnique.mockResolvedValueOnce(null);

    const response = await request(app.getHttpServer()).post(
      '/api/admin/quizzes/missing-quiz/publish',
    );

    expect(response.status).toBe(404);
    expect(response.body.message).toContain('Quiz with id missing-quiz not found');
    expect(prismaMock.question.count).not.toHaveBeenCalled();
    expect(prismaMock.quiz.update).not.toHaveBeenCalled();
  });

  it('filters the admin list by quiz status', async () => {
    prismaMock.quiz.findMany.mockResolvedValueOnce([
      {
        id: 'quiz-1',
        title: 'Draft Quiz',
        description: null,
        status: 'DRAFT',
        durationMinutes: null,
        passingScore: null,
        startsAt: null,
        endsAt: null,
        createdById: null,
        createdAt: '2026-06-10T00:00:00.000Z',
        updatedAt: '2026-06-10T00:00:00.000Z',
      },
    ]);

    const response = await request(app.getHttpServer()).get(
      '/api/admin/quizzes?status=Draft',
    );

    expect(response.status).toBe(200);
    expect(prismaMock.quiz.findMany).toHaveBeenCalledWith({
      where: { status: 'DRAFT' },
    });
    expect(response.body).toHaveLength(1);
  });

  it('returns 404 when a requested quiz does not exist', async () => {
    prismaMock.quiz.findUnique.mockResolvedValueOnce(null);

    const response = await request(app.getHttpServer()).get(
      '/api/admin/quizzes/missing-quiz',
    );

    expect(response.status).toBe(404);
    expect(response.body.message).toContain('Quiz with id missing-quiz not found');
  });
});
