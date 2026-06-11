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

    prisma = app.get<PrismaService>(PrismaService);
    jest.spyOn(prisma, '$connect').mockImplementation(async () => {});
    jest.spyOn(prisma, '$disconnect').mockImplementation(async () => {});

    await app.init();
    // We mock PrismaService to avoid DB connection issues if Docker is not available in the environment
    jest.spyOn(prisma.quiz, 'findUnique').mockImplementation((async (args: any): Promise<any> => {
      if (args.where.id === 'valid-quiz-id') {
        return { id: 'valid-quiz-id', title: 'Test', creatorId: 'user-id', createdAt: new Date(), updatedAt: new Date(), description: '' };
      }
      return null;
    }) as any);

    jest.spyOn(prisma.question, 'create').mockImplementation((async (args: any): Promise<any> => {
      return { id: 'new-q-id', ...args.data, createdAt: new Date(), updatedAt: new Date() };
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
});
