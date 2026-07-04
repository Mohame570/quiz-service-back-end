import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AttemptStatus } from '../src/generated/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AttemptsService } from '../src/modules/attempts/services/attempts.service';
import { ScoringService } from '../src/modules/attempts/services/scoring.service';

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
    textAnswer: null,
    isCorrect: null,
    answeredAt: new Date(),
    ...overrides,
  };
}

function makePrismaMock() {
  return {
    quiz: {
      findUnique: jest.fn(),
    },
    studentProfile: {
      findUnique: jest.fn(),
    },
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
  let scoringService: { scoreAttempt: jest.Mock };

  beforeEach(async () => {
    prisma = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttemptsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ScoringService, useValue: { scoreAttempt: jest.fn().mockImplementation(async (id) => prisma.attempt.findUnique({ where: { id }, include: { answers: true } })) } },
      ],
    }).compile();

    service = module.get<AttemptsService>(AttemptsService);
    scoringService = module.get(ScoringService);

    prisma.quiz.findUnique.mockResolvedValue({ id: QUIZ_ID });
    prisma.studentProfile.findUnique.mockResolvedValue({ userId: STUDENT_ID });
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

    it('throws NotFoundException when quiz does not exist', async () => {
      prisma.quiz.findUnique.mockResolvedValueOnce(null);

      await expect(service.start(QUIZ_ID, STUDENT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when student profile does not exist', async () => {
      prisma.studentProfile.findUnique.mockResolvedValueOnce(null);

      await expect(service.start(QUIZ_ID, STUDENT_ID)).rejects.toThrow(
        ForbiddenException,
      );
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

    it('upserts textAnswer for text-based questions', async () => {
      prisma.attempt.findUnique.mockResolvedValue(makeAttempt());
      const answer = makeAnswer({
        selectedOptionId: null,
        textAnswer: 'paris',
      });
      prisma.attemptAnswer.upsert.mockResolvedValue(answer);
      prisma.$transaction.mockResolvedValue([answer]);

      const result = await service.saveAnswers(ATTEMPT_ID, STUDENT_ID, [
        { questionId: Q1_ID, selectedOptionId: null, textAnswer: 'paris' },
      ]);

      expect(prisma.attemptAnswer.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            selectedOptionId: null,
            textAnswer: 'paris',
          }),
          update: expect.objectContaining({
            selectedOptionId: null,
            textAnswer: 'paris',
          }),
        }),
      );
      expect(result[0].textAnswer).toBe('paris');
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
      const submitted = makeAttempt({
        status: AttemptStatus.SUBMITTED,
        submittedAt: new Date(),
        answers: [],
      });
      prisma.attempt.findUnique.mockResolvedValue(makeAttempt());
      prisma.attempt.update.mockResolvedValue(submitted);
      prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma as any));
      (scoringService.scoreAttempt as jest.Mock).mockResolvedValue(submitted);

      const result = await service.submit(ATTEMPT_ID, STUDENT_ID, []);

      expect(result.status).toBe(AttemptStatus.SUBMITTED);
      expect(result.submittedAt).toBeInstanceOf(Date);
    });

    it('submittedAt is >= startedAt', async () => {
      const startedAt = new Date('2026-06-01T10:00:00Z');
      const submittedAt = new Date('2026-06-01T10:30:00Z');
      const submitted = makeAttempt({
        status: AttemptStatus.SUBMITTED,
        startedAt,
        submittedAt,
        answers: [],
      });
      prisma.attempt.findUnique.mockResolvedValue(makeAttempt({ startedAt }));
      prisma.attempt.update.mockResolvedValue(submitted);
      prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma as any));
      (scoringService.scoreAttempt as jest.Mock).mockResolvedValue(submitted);

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

    it('delegates scoring to ScoringService and returns its result (Sprint 2)', async () => {
      const scored = makeAttempt({
        status: AttemptStatus.SUBMITTED,
        submittedAt: new Date(),
        score: 1,
        maxScore: 1,
        answers: [],
      });
      prisma.attempt.findUnique.mockResolvedValue(makeAttempt());
      prisma.attempt.update.mockResolvedValue(scored);
      prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma as any));
      (scoringService.scoreAttempt as jest.Mock).mockResolvedValue(scored);

      const result = await service.submit(ATTEMPT_ID, STUDENT_ID, []);

      expect(scoringService.scoreAttempt).toHaveBeenCalledWith(ATTEMPT_ID);
      expect(result.score).toBe(1);
      expect(result.maxScore).toBe(1);
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
