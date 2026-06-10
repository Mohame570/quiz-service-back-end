// src/modules/attempts/attempts.service.spec.ts

import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AttemptStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AttemptsService } from './services/attempts.service';

// ---------------------------------------------------------------------------
// Prisma mock factory
// ---------------------------------------------------------------------------

const STUDENT_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const QUIZ_ID    = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const ATTEMPT_ID = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const Q1_ID      = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';
const OPT1_ID    = 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee';

function makeAttempt(overrides: Partial<any> = {}): any {
  return {
    id: ATTEMPT_ID,
    quizId: QUIZ_ID,
    studentId: STUDENT_ID,
    startedAt: new Date('2026-06-01T10:00:00Z'),
    submittedAt: null,
    status: AttemptStatus.IN_PROGRESS,
    score: null,
    maxScore: null,
    createdAt: new Date('2026-06-01T10:00:00Z'),
    updatedAt: new Date('2026-06-01T10:00:00Z'),
    answers: [],
    ...overrides,
  };
}

function makeAnswer(overrides: Partial<any> = {}): any {
  return {
    id: 'ffffffff-ffff-4fff-ffff-ffffffffffff',
    attemptId: ATTEMPT_ID,
    questionId: Q1_ID,
    selectedOptionId: OPT1_ID,
    isCorrect: null,
    answeredAt: new Date(),
    ...overrides,
  };
}

function makePrismaMock() {
  return {
    attempt: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    attemptAnswer: {
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe('AttemptsService', () => {
  let service: AttemptsService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttemptsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AttemptsService>(AttemptsService);
  });

  afterEach(() => jest.clearAllMocks());

  // -------------------------------------------------------------------------
  // start()
  // -------------------------------------------------------------------------

  describe('start()', () => {
    it('creates an attempt with IN_PROGRESS status', async () => {
      const attempt = makeAttempt();
      prisma.attempt.create.mockResolvedValue(attempt);

      const result = await service.start(QUIZ_ID, STUDENT_ID);

      expect(prisma.attempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quizId: QUIZ_ID,
            studentId: STUDENT_ID,
            status: AttemptStatus.IN_PROGRESS,
          }),
        }),
      );
      expect(result.status).toBe(AttemptStatus.IN_PROGRESS);
    });

    it('records startedAt', async () => {
      const attempt = makeAttempt();
      prisma.attempt.create.mockResolvedValue(attempt);

      const result = await service.start(QUIZ_ID, STUDENT_ID);

      expect(result.startedAt).toBeInstanceOf(Date);
    });

    it('returns submittedAt as null', async () => {
      prisma.attempt.create.mockResolvedValue(makeAttempt());
      const result = await service.start(QUIZ_ID, STUDENT_ID);
      expect(result.submittedAt).toBeNull();
    });

    it('associates the correct student', async () => {
      prisma.attempt.create.mockResolvedValue(makeAttempt());
      const result = await service.start(QUIZ_ID, STUDENT_ID);
      expect(result.studentId).toBe(STUDENT_ID);
    });

    it('returns an empty answers array', async () => {
      prisma.attempt.create.mockResolvedValue(makeAttempt({ answers: [] }));
      const result = await service.start(QUIZ_ID, STUDENT_ID);
      expect(result.answers).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // list()
  // -------------------------------------------------------------------------

  describe('list()', () => {
    it('returns attempts belonging to the student', async () => {
      const attempts = [makeAttempt(), makeAttempt({ id: 'other-id' })];
      prisma.attempt.findMany.mockResolvedValue(attempts);

      const result = await service.list(STUDENT_ID);

      expect(result).toHaveLength(2);
      result.forEach((a) => expect(a.studentId).toBe(STUDENT_ID));
    });

    it('passes quizId filter when provided', async () => {
      prisma.attempt.findMany.mockResolvedValue([makeAttempt()]);

      await service.list(STUDENT_ID, QUIZ_ID);

      expect(prisma.attempt.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ quizId: QUIZ_ID }),
        }),
      );
    });

    it('does not include answers in list items', async () => {
      prisma.attempt.findMany.mockResolvedValue([makeAttempt()]);
      const result = await service.list(STUDENT_ID);
      expect((result[0] as any).answers).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // findOne()
  // -------------------------------------------------------------------------

  describe('findOne()', () => {
    it('returns the attempt with answers', async () => {
      const answer = makeAnswer();
      prisma.attempt.findUnique.mockResolvedValue(makeAttempt({ answers: [answer] }));

      const result = await service.findOne(ATTEMPT_ID, STUDENT_ID);

      expect(result.id).toBe(ATTEMPT_ID);
      expect(result.answers).toHaveLength(1);
    });

    it('throws NotFoundException for unknown id', async () => {
      prisma.attempt.findUnique.mockResolvedValue(null);
      await expect(service.findOne('unknown-id', STUDENT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when student does not own the attempt', async () => {
      prisma.attempt.findUnique.mockResolvedValue(
        makeAttempt({ studentId: 'other-student' }),
      );
      await expect(service.findOne(ATTEMPT_ID, STUDENT_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // saveAnswers()
  // -------------------------------------------------------------------------

  describe('saveAnswers()', () => {
    it('upserts answers and returns them', async () => {
      prisma.attempt.findUnique.mockResolvedValue(makeAttempt());
      const answer = makeAnswer();
      prisma.attemptAnswer.upsert.mockResolvedValue(answer);
      prisma.$transaction.mockResolvedValue([answer]);

      const result = await service.saveAnswers(ATTEMPT_ID, STUDENT_ID, [
        { questionId: Q1_ID, selectedOptionId: OPT1_ID },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].questionId).toBe(Q1_ID);
    });

    it('allows null selectedOptionId (skipped question)', async () => {
      prisma.attempt.findUnique.mockResolvedValue(makeAttempt());
      const answer = makeAnswer({ selectedOptionId: null });
      prisma.attemptAnswer.upsert.mockResolvedValue(answer);
      prisma.$transaction.mockResolvedValue([answer]);

      const result = await service.saveAnswers(ATTEMPT_ID, STUDENT_ID, [
        { questionId: Q1_ID, selectedOptionId: null },
      ]);

      expect(result[0].selectedOptionId).toBeNull();
    });

    it('throws ConflictException when attempt is already submitted', async () => {
      prisma.attempt.findUnique.mockResolvedValue(
        makeAttempt({ status: AttemptStatus.SUBMITTED }),
      );
      await expect(
        service.saveAnswers(ATTEMPT_ID, STUDENT_ID, [
          { questionId: Q1_ID, selectedOptionId: OPT1_ID },
        ]),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException for unknown attempt', async () => {
      prisma.attempt.findUnique.mockResolvedValue(null);
      await expect(
        service.saveAnswers('bad-id', STUDENT_ID, []),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // submit()
  // -------------------------------------------------------------------------

  describe('submit()', () => {
    it('sets status to SUBMITTED and records submittedAt', async () => {
      prisma.attempt.findUnique.mockResolvedValue(makeAttempt());
      const submitted = makeAttempt({
        status: AttemptStatus.SUBMITTED,
        submittedAt: new Date(),
        answers: [],
      });
      prisma.$transaction.mockResolvedValue([submitted]);

      const result = await service.submit(ATTEMPT_ID, STUDENT_ID, []);

      expect(result.status).toBe(AttemptStatus.SUBMITTED);
      expect(result.submittedAt).toBeInstanceOf(Date);
    });

    it('submittedAt is >= startedAt', async () => {
      const startedAt = new Date('2026-06-01T10:00:00Z');
      const submittedAt = new Date('2026-06-01T10:30:00Z');
      prisma.attempt.findUnique.mockResolvedValue(makeAttempt({ startedAt }));
      prisma.$transaction.mockResolvedValue([
        makeAttempt({ status: AttemptStatus.SUBMITTED, startedAt, submittedAt, answers: [] }),
      ]);

      const result = await service.submit(ATTEMPT_ID, STUDENT_ID, []);

      expect(result.submittedAt!.getTime()).toBeGreaterThanOrEqual(
        result.startedAt.getTime(),
      );
    });

    it('throws ConflictException when already submitted', async () => {
      prisma.attempt.findUnique.mockResolvedValue(
        makeAttempt({ status: AttemptStatus.SUBMITTED }),
      );
      await expect(service.submit(ATTEMPT_ID, STUDENT_ID, [])).rejects.toThrow(
        ConflictException,
      );
    });

    it('score is null until scoring service runs (Sprint 2)', async () => {
      prisma.attempt.findUnique.mockResolvedValue(makeAttempt());
      prisma.$transaction.mockResolvedValue([
        makeAttempt({ status: AttemptStatus.SUBMITTED, submittedAt: new Date(), answers: [] }),
      ]);
      const result = await service.submit(ATTEMPT_ID, STUDENT_ID, []);
      expect(result.score).toBeNull();
      expect(result.maxScore).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getResult()
  // -------------------------------------------------------------------------

  describe('getResult()', () => {
    it('returns the attempt after submission', async () => {
      prisma.attempt.findUnique.mockResolvedValue(
        makeAttempt({
          status: AttemptStatus.SUBMITTED,
          submittedAt: new Date(),
          answers: [],
        }),
      );

      const result = await service.getResult(ATTEMPT_ID, STUDENT_ID);

      expect(result.status).toBe(AttemptStatus.SUBMITTED);
    });

    it('throws ConflictException when still in progress', async () => {
      prisma.attempt.findUnique.mockResolvedValue(makeAttempt());
      await expect(service.getResult(ATTEMPT_ID, STUDENT_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException for unknown attempt', async () => {
      prisma.attempt.findUnique.mockResolvedValue(null);
      await expect(service.getResult('bad-id', STUDENT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
