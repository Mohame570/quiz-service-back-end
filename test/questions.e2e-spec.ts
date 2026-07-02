import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';

describe('QuestionsController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    
    // We mock PrismaService to avoid DB connection issues if Docker is not available in the environment
    jest.spyOn(prisma.quiz, 'findUnique').mockImplementation((async (args: any): Promise<any> => {
      if (args.where.id === 'valid-quiz-id') {
        return { id: 'valid-quiz-id', title: 'Test', creatorId: 'user-id', status: 'DRAFT', createdAt: new Date(), updatedAt: new Date(), description: '' };
      }
      if (args.where.id === 'published-quiz-id') {
        return { id: 'published-quiz-id', title: 'Test', creatorId: 'user-id', status: 'PUBLISHED', createdAt: new Date(), updatedAt: new Date(), description: '' };
      }
      return null;
    }) as any);

    jest.spyOn(prisma.question, 'create').mockImplementation((async (args: any): Promise<any> => {
      return { id: 'new-q-id', ...args.data, createdAt: new Date(), updatedAt: new Date() };
    }) as any);

    jest.spyOn(prisma.question, 'findUnique').mockImplementation((async (args: any): Promise<any> => {
      if (args.where.id === 'valid-q-id') {
        return { 
          id: 'valid-q-id', quizId: 'valid-quiz-id', type: 'MCQ', text: 'Old text', options: ['A', 'B'], correctAnswer: 'A', points: 1, order: 0, createdAt: new Date(), updatedAt: new Date(),
          quiz: { status: 'DRAFT' }
        };
      }
      if (args.where.id === 'published-q-id') {
        return { 
          id: 'published-q-id', quizId: 'published-quiz-id', type: 'MCQ', text: 'Old text', options: ['A', 'B'], correctAnswer: 'A', points: 1, order: 0, createdAt: new Date(), updatedAt: new Date(),
          quiz: { status: 'PUBLISHED' }
        };
      }
      return null;
    }) as any);

    jest.spyOn(prisma.question, 'update').mockImplementation((async (args: any): Promise<any> => {
      return { id: args.where.id, ...args.data, createdAt: new Date(), updatedAt: new Date() };
    }) as any);

    jest.spyOn(prisma.question, 'delete').mockImplementation((async (args: any): Promise<any> => {
      return { id: args.where.id, createdAt: new Date(), updatedAt: new Date() };
    }) as any);

    jest.spyOn(prisma.question, 'findMany').mockImplementation((async (args: any): Promise<any> => {
      if (args?.where?.quizId === 'valid-quiz-id') {
        return [{ id: 'valid-q-id', quizId: 'valid-quiz-id', type: 'MCQ', text: 'Old text', options: ['A', 'B'], correctAnswer: 'A', createdAt: new Date(), updatedAt: new Date() }];
      }
      return [];
    }) as any);
  });

  afterAll(async () => {
    await app.close();
  });

  it('/questions (POST) - Success MCQ', () => {
    return request(app.getHttpServer())
      .post('/questions')
      .send({
        quizId: 'valid-quiz-id',
        type: 'MCQ',
        text: 'What is 2+2?',
        options: ['3', '4', '5'],
        correctAnswer: '4'
      })
      .expect(201)
      .expect((res: any) => {
        expect(res.body.text).toBe('What is 2+2?');
      });
  });

  it('/questions (POST) - Fail MCQ invalid answer', () => {
    return request(app.getHttpServer())
      .post('/questions')
      .send({
        quizId: 'valid-quiz-id',
        type: 'MCQ',
        text: 'What is 2+2?',
        options: ['3', '4', '5'],
        correctAnswer: '6' // Not in options
      })
      .expect(400);
  });

  it('/questions (POST) - Success TRUE_FALSE', () => {
    return request(app.getHttpServer())
      .post('/questions')
      .send({
        quizId: 'valid-quiz-id',
        type: 'TRUE_FALSE',
        text: 'The earth is flat.',
        correctAnswer: 'False'
      })
      .expect(201);
  });

  it('/questions (POST) - Fail TRUE_FALSE invalid answer', () => {
    return request(app.getHttpServer())
      .post('/questions')
      .send({
        quizId: 'valid-quiz-id',
        type: 'TRUE_FALSE',
        text: 'The earth is flat.',
        correctAnswer: 'No' // Must be 'True' or 'False'
      })
      .expect(400);
  });

  it('/questions (POST) - Success SHORT_TEXT', () => {
    return request(app.getHttpServer())
      .post('/questions')
      .send({
        quizId: 'valid-quiz-id',
        type: 'SHORT_TEXT',
        text: 'Capital of France?',
        correctAnswer: 'Paris',
      })
      .expect(201)
      .expect((res: any) => {
        expect(res.body.type).toBe('SHORT_TEXT');
        expect(res.body.correctAnswer).toBe('Paris');
      });
  });

  it('/questions (POST) - Fail SHORT_TEXT empty correctAnswer', () => {
    return request(app.getHttpServer())
      .post('/questions')
      .send({
        quizId: 'valid-quiz-id',
        type: 'SHORT_TEXT',
        text: 'Capital of France?',
        correctAnswer: '   ',
      })
      .expect(400);
  });

  it('/questions (POST) - Success ESSAY without correctAnswer', () => {
    return request(app.getHttpServer())
      .post('/questions')
      .send({
        quizId: 'valid-quiz-id',
        type: 'ESSAY',
        text: 'Explain REST in your own words.',
      })
      .expect(201)
      .expect((res: any) => {
        expect(res.body.type).toBe('ESSAY');
        expect(res.body.correctAnswer).toBe('');
      });
  });

  it('/questions/:id (PATCH) - Success', () => {
    return request(app.getHttpServer())
      .patch('/questions/valid-q-id')
      .send({
        text: 'New text',
        correctAnswer: 'B' // Valid since 'B' is in options
      })
      .expect(200)
      .expect((res: any) => {
        expect(res.body.text).toBe('New text');
        expect(res.body.correctAnswer).toBe('B');
      });
  });

  it('/questions/:id (PATCH) - Fail invalid answer', () => {
    return request(app.getHttpServer())
      .patch('/questions/valid-q-id')
      .send({
        correctAnswer: 'C' // Not in old options ['A', 'B']
      })
      .expect(400);
  });

  it('/questions/:id (DELETE) - Success', () => {
    return request(app.getHttpServer())
      .delete('/questions/valid-q-id')
      .expect(200);
  });

  it('/questions (GET) - Success list with quizId', () => {
    return request(app.getHttpServer())
      .get('/questions?quizId=valid-quiz-id')
      .expect(200)
      .expect((res: any) => {
        expect(Array.isArray(res.body)).toBeTruthy();
        expect(res.body.length).toBe(1);
        expect(res.body[0].quizId).toBe('valid-quiz-id');
      });
  });

  it('/questions/:id (GET) - Success', () => {
    return request(app.getHttpServer())
      .get('/questions/valid-q-id')
      .expect(200)
      .expect((res: any) => {
        expect(res.body.id).toBe('valid-q-id');
        expect(res.body.text).toBe('Old text');
      });
  });

  it('/questions/:id (GET) - Not found', () => {
    return request(app.getHttpServer())
      .get('/questions/invalid-id')
      .expect(404);
  });

  it('/questions (POST) - Fail if quiz is PUBLISHED', () => {
    return request(app.getHttpServer())
      .post('/questions')
      .send({
        quizId: 'published-quiz-id',
        type: 'MCQ',
        text: 'What is 2+2?',
        options: ['3', '4', '5'],
        correctAnswer: '4'
      })
      .expect(403);
  });

  it('/questions/:id (PATCH) - Fail if quiz is PUBLISHED', () => {
    return request(app.getHttpServer())
      .patch('/questions/published-q-id')
      .send({ text: 'Updated text' })
      .expect(403);
  });

  it('/questions/:id (DELETE) - Fail if quiz is PUBLISHED', () => {
    return request(app.getHttpServer())
      .delete('/questions/published-q-id')
      .expect(403);
  });

  it('/questions (POST) - Fail MCQ duplicate options', () => {
    return request(app.getHttpServer())
      .post('/questions')
      .send({
        quizId: 'valid-quiz-id',
        type: 'MCQ',
        text: 'Duplicate options?',
        options: ['A', 'A', 'B'],
        correctAnswer: 'A'
      })
      .expect(400);
  });

  it('/questions (POST) - Success with points and order', () => {
    return request(app.getHttpServer())
      .post('/questions')
      .send({
        quizId: 'valid-quiz-id',
        type: 'TRUE_FALSE',
        text: 'The earth is round.',
        correctAnswer: 'True',
        points: 5,
        order: 1
      })
      .expect(201);
  });
});
