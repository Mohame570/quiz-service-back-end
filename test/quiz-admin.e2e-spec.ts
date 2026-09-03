import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';

import { PrismaService } from '../src/common/prisma/prisma.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
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
      count: jest.fn(),
    },
    question: {
      findMany: jest.fn(),
    },
    quizQuestion: {
      count: jest.fn(),
      findMany: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true }), QuizModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().user = {
            sub: 'admin-1',
            role: 'ADMIN',
          };
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
        createdById: 'spoofed-user-id',
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
        description: 'Admin-created quiz',
        durationMinutes: 45,
        passingScore: 80,
        startsAt: '2026-06-15T00:00:00Z',
        endsAt: '2026-06-20T00:00:00Z',
        createdById: 'admin-1',
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
        description: 'Admin-created quiz',
        durationMinutes: 45,
        passingScore: 80,
        startsAt: '2026-06-15T00:00:00Z',
        endsAt: '2026-06-20T00:00:00Z',
        createdById: 'admin-1',
      });

    expect(response.status).toBe(400);
    expect(prismaMock.quiz.create).not.toHaveBeenCalled();
  });

  it('rejects creating a quiz with a non-positive duration', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/admin/quizzes')
      .send({
        title: 'Sprint 1 Quiz',
        description: 'Admin-created quiz',
        durationMinutes: 0,
        passingScore: 80,
        startsAt: '2026-06-15T00:00:00Z',
        endsAt: '2026-06-20T00:00:00Z',
        createdById: 'admin-1',
      });

    expect(response.status).toBe(400);
    expect(prismaMock.quiz.create).not.toHaveBeenCalled();
  });

  it('rejects creating a quiz when the end date is not after the start date', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/admin/quizzes')
      .send({
        title: 'Sprint 1 Quiz',
        description: 'Admin-created quiz',
        durationMinutes: 45,
        passingScore: 80,
        startsAt: '2026-06-20T00:00:00Z',
        endsAt: '2026-06-20T00:00:00Z',
        createdById: 'admin-1',
      });

    expect(response.status).toBe(400);
    expect(prismaMock.quiz.create).not.toHaveBeenCalled();
  });

  it('rejects creating a quiz when required fields are missing', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/admin/quizzes')
      .send({ title: 'Sprint 1 Quiz' });

    expect(response.status).toBe(400);
    expect(prismaMock.quiz.create).not.toHaveBeenCalled();
  });

  it('rejects creating a quiz when description is missing', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/admin/quizzes')
      .send({
        title: 'Sprint 1 Quiz',
        durationMinutes: 45,
        passingScore: 80,
        startsAt: '2026-06-15T00:00:00Z',
        endsAt: '2026-06-20T00:00:00Z',
        createdById: 'admin-1',
      });

    expect(response.status).toBe(400);
    expect(prismaMock.quiz.create).not.toHaveBeenCalled();
  });

  it('updates a quiz status through the admin patch endpoint', async () => {
    prismaMock.quiz.findUnique.mockResolvedValueOnce({
      id: 'quiz-1',
    });
    prismaMock.quizQuestion.count.mockResolvedValueOnce(1);
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
    expect(prismaMock.quizQuestion.count).toHaveBeenCalledWith({
      where: { quizId: 'quiz-1' },
    });
    expect(prismaMock.quiz.update).toHaveBeenCalledWith({
      where: { id: 'quiz-1' },
      data: {
        status: 'PUBLISHED',
      },
    });
  });

  it('rejects updating a quiz with a non-positive duration', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/admin/quizzes/quiz-1')
      .send({
        durationMinutes: -5,
      });

    expect(response.status).toBe(400);
    expect(prismaMock.quiz.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.quiz.update).not.toHaveBeenCalled();
  });

  it('rejects updating a quiz when a partial date change makes the stored range invalid', async () => {
    prismaMock.quiz.findUnique.mockResolvedValueOnce({
      id: 'quiz-1',
      startsAt: new Date('2026-06-15T00:00:00Z'),
      endsAt: new Date('2026-06-20T00:00:00Z'),
    });

    const response = await request(app.getHttpServer())
      .patch('/api/admin/quizzes/quiz-1')
      .send({
        endsAt: '2026-06-10T00:00:00Z',
      });

    expect(response.status).toBe(400);
    expect(prismaMock.quiz.findUnique).toHaveBeenCalledWith({
      where: { id: 'quiz-1' },
    });
    expect(prismaMock.quiz.update).not.toHaveBeenCalled();
  });

  it('rejects patching a quiz to published when it has no questions', async () => {
    prismaMock.quiz.findUnique.mockResolvedValueOnce({
      id: 'quiz-1',
    });
    prismaMock.quizQuestion.count.mockResolvedValueOnce(0);

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
    expect(prismaMock.quizQuestion.count).not.toHaveBeenCalled();
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
    expect(prismaMock.quizQuestion.count).not.toHaveBeenCalled();
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
    prismaMock.quizQuestion.count.mockResolvedValueOnce(1);
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
    expect(prismaMock.quizQuestion.count).toHaveBeenCalledWith({
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
    prismaMock.quizQuestion.count.mockResolvedValueOnce(0);

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
    expect(prismaMock.quizQuestion.count).not.toHaveBeenCalled();
    expect(prismaMock.quiz.update).not.toHaveBeenCalled();
  });

  it('unpublishes a published quiz back to draft', async () => {
    prismaMock.quiz.findUnique.mockResolvedValueOnce({
      id: 'quiz-1',
      status: 'PUBLISHED',
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

    const response = await request(app.getHttpServer()).post(
      '/api/admin/quizzes/quiz-1/unpublish',
    );

    expect(response.status).toBe(200);
    expect(prismaMock.quiz.update).toHaveBeenCalledWith({
      where: { id: 'quiz-1' },
      data: {
        status: 'DRAFT',
      },
    });
    expect(response.body.status).toBe('DRAFT');
  });

  it('unpublishes an already draft quiz idempotently', async () => {
    prismaMock.quiz.findUnique.mockResolvedValueOnce({
      id: 'quiz-1',
      status: 'DRAFT',
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

    const response = await request(app.getHttpServer()).post(
      '/api/admin/quizzes/quiz-1/unpublish',
    );

    expect(response.status).toBe(200);
    expect(prismaMock.quiz.update).toHaveBeenCalledWith({
      where: { id: 'quiz-1' },
      data: {
        status: 'DRAFT',
      },
    });
    expect(response.body.status).toBe('DRAFT');
  });

  it('returns 404 when unpublishing a quiz that does not exist', async () => {
    prismaMock.quiz.findUnique.mockResolvedValueOnce(null);

    const response = await request(app.getHttpServer()).post(
      '/api/admin/quizzes/missing-quiz/unpublish',
    );

    expect(response.status).toBe(404);
    expect(response.body.message).toContain('Quiz with id missing-quiz not found');
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
    prismaMock.quiz.count.mockResolvedValueOnce(1);

    const response = await request(app.getHttpServer()).get(
      '/api/admin/quizzes?status=Draft',
    );

    expect(response.status).toBe(200);
    expect(prismaMock.quiz.findMany).toHaveBeenCalledWith({
      where: { status: 'DRAFT' },
      skip: 0,
      take: 10,
    });
    expect(response.body.quizzes).toHaveLength(1);
  });

  it('returns 404 when a requested quiz does not exist', async () => {
    prismaMock.quiz.findUnique.mockResolvedValueOnce(null);

    const response = await request(app.getHttpServer()).get(
      '/api/admin/quizzes/missing-quiz',
    );

    expect(response.status).toBe(404);
    expect(response.body.message).toContain('Quiz with id missing-quiz not found');
  });

  describe('POST /admin/quizzes/:id/questions', () => {
    it('returns 404 when the quiz does not exist', async () => {
      prismaMock.quiz.findUnique.mockResolvedValueOnce(null);

      const response = await request(app.getHttpServer())
        .post('/api/admin/quizzes/missing-quiz/questions')
        .send({ questions: [{ questionId: 'question-1', order: 1 }] });

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('Quiz with id missing-quiz not found');
      expect(prismaMock.quizQuestion.createMany).not.toHaveBeenCalled();
    });

    it('rejects attaching questions to a quiz that is not in draft status', async () => {
      prismaMock.quiz.findUnique.mockResolvedValueOnce({
        id: 'quiz-1',
        status: 'PUBLISHED',
      });

      const response = await request(app.getHttpServer())
        .post('/api/admin/quizzes/quiz-1/questions')
        .send({ questions: [{ questionId: 'question-1', order: 1 }] });

      expect(response.status).toBe(403);
      expect(prismaMock.quizQuestion.createMany).not.toHaveBeenCalled();
    });

    it('rejects attaching a question that does not exist', async () => {
      prismaMock.quiz.findUnique.mockResolvedValueOnce({
        id: 'quiz-1',
        status: 'DRAFT',
      });
      prismaMock.question.findMany.mockResolvedValueOnce([]);

      const response = await request(app.getHttpServer())
        .post('/api/admin/quizzes/quiz-1/questions')
        .send({ questions: [{ questionId: 'missing-question', order: 1 }] });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('One or more questions not found');
      expect(prismaMock.quizQuestion.createMany).not.toHaveBeenCalled();
    });

    it('attaches existing questions to a draft quiz', async () => {
      prismaMock.quiz.findUnique.mockResolvedValueOnce({
        id: 'quiz-1',
        status: 'DRAFT',
      });
      prismaMock.question.findMany.mockResolvedValueOnce([
        { id: 'question-1' },
        { id: 'question-2' },
      ]);
      prismaMock.quizQuestion.createMany.mockResolvedValueOnce({ count: 2 });
      prismaMock.quizQuestion.findMany.mockResolvedValueOnce([
        { quizId: 'quiz-1', questionId: 'question-1', order: 1 },
        { quizId: 'quiz-1', questionId: 'question-2', order: 2 },
      ]);

      const response = await request(app.getHttpServer())
        .post('/api/admin/quizzes/quiz-1/questions')
        .send({
          questions: [
            { questionId: 'question-1', order: 1 },
            { questionId: 'question-2', order: 2 },
          ],
        });

      expect(response.status).toBe(201);
      expect(prismaMock.quizQuestion.createMany).toHaveBeenCalledWith({
        data: [
          { quizId: 'quiz-1', questionId: 'question-1', order: 1 },
          { quizId: 'quiz-1', questionId: 'question-2', order: 2 },
        ],
        skipDuplicates: true,
      });
      expect(response.body).toEqual([
        { quizId: 'quiz-1', questionId: 'question-1', order: 1 },
        { quizId: 'quiz-1', questionId: 'question-2', order: 2 },
      ]);
    });

    it('rejects an empty questions array', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/admin/quizzes/quiz-1/questions')
        .send({ questions: [] });

      expect(response.status).toBe(400);
      expect(prismaMock.quiz.findUnique).not.toHaveBeenCalled();
    });
  });
});
