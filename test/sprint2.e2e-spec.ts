// test/sprint2.e2e-spec.ts
//
// IMPORTANT: This file MUST live in test/ (not src/modules/) and MUST be
// named *.e2e-spec.ts to be picked up by this project's Jest config
// (test/jest-e2e.json), which only matches "test/.*\.e2e-spec\.ts$".
//
// Despite the filename, this follows the same pattern as the existing
// test/attempts.e2e-spec.ts — a mocked unit test using NestJS's
// Test.createTestingModule with a stubbed PrismaService, not a real
// database connection.

import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AttemptStatus, CheatingEventType } from '../src/generated/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ScoringService } from '../src/modules/attempts/services/scoring.service';
import { IntegrityService } from '../src/modules/integrity/services/integrity.service';

const STUDENT_ID = 'student_cuid_1';
const QUIZ_ID    = 'quiz_cuid_1';
const ATTEMPT_ID = 'attempt_cuid_1';
const Q1_ID      = 'question_cuid_1';
const Q2_ID      = 'question_cuid_2';
const Q3_ID      = 'question_cuid_3';

function makeAttempt(overrides: Partial<any> = {}): any {
  return {
    id: ATTEMPT_ID, quizId: QUIZ_ID, studentId: STUDENT_ID,
    startedAt: new Date('2026-06-01T10:00:00Z'),
    submittedAt: new Date('2026-06-01T10:30:00Z'),
    status: AttemptStatus.SUBMITTED, score: null, maxScore: null,
    createdAt: new Date(), updatedAt: new Date(), answers: [],
    ...overrides,
  };
}

function makeAnswer(questionId: string, selectedOptionId: string | null, overrides: Partial<any> = {}): any {
  return {
    id: `${questionId}_ans`, attemptId: ATTEMPT_ID,
    questionId, selectedOptionId, isCorrect: null, answeredAt: new Date(),
    ...overrides,
  };
}

function makePrisma() {
  return {
    attempt: { findUnique: jest.fn(), update: jest.fn() },
    attemptAnswer: { update: jest.fn() },
    question: { findMany: jest.fn() },
    result: { upsert: jest.fn() },
    cheatingEventLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
}

// ===========================================================================
// SCORING SERVICE
// ===========================================================================

describe('ScoringService', () => {
  let service: ScoringService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScoringService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<ScoringService>(ScoringService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('compareAnswer() — real comparison against Question.correctAnswer', () => {
    it('returns true when the selected text matches correctAnswer exactly', () => {
      expect(service.compareAnswer('Paris', 'Paris')).toBe(true);
    });

    it('returns false when the selected text does not match', () => {
      expect(service.compareAnswer('London', 'Paris')).toBe(false);
    });

    it('returns false when the student skipped the question (null selection)', () => {
      expect(service.compareAnswer(null, 'Paris')).toBe(false);
    });

    it('returns null when the question has no correctAnswer on file', () => {
      expect(service.compareAnswer('Paris', undefined)).toBeNull();
    });

    it('is case-sensitive, matching how correctAnswer is validated on creation', () => {
      expect(service.compareAnswer('paris', 'Paris')).toBe(false);
    });

    it('handles True/False questions correctly', () => {
      expect(service.compareAnswer('True', 'True')).toBe(true);
      expect(service.compareAnswer('False', 'True')).toBe(false);
    });
  });

  describe('computePercentage()', () => {
    it('returns 100 when all correct', () => expect(service.computePercentage(5, 5)).toBe(100));
    it('returns 0 when score is 0', () => expect(service.computePercentage(0, 5)).toBe(0));
    it('returns 0 when maxScore is 0', () => expect(service.computePercentage(0, 0)).toBe(0));
    it('returns 66.67 for 2/3', () => expect(service.computePercentage(2, 3)).toBe(66.67));
    it('is deterministic', () => {
      expect(service.computePercentage(3, 7)).toBe(service.computePercentage(3, 7));
    });
  });

  describe('scoreAttempt()', () => {
    it('throws NotFoundException for unknown attempt', async () => {
      prisma.attempt.findUnique.mockResolvedValue(null);
      await expect(service.scoreAttempt('bad_id')).rejects.toThrow(NotFoundException);
    });

    it('scores 0/0 when no answers were submitted', async () => {
      prisma.attempt.findUnique.mockResolvedValue(makeAttempt({ answers: [] }));
      prisma.$transaction.mockResolvedValue([]);
      const result = await service.scoreAttempt(ATTEMPT_ID);
      expect(result.score).toBe(0);
      expect(result.maxScore).toBe(0);
    });

    it('scores all-correct answers as score == maxScore', async () => {
      const answers = [makeAnswer(Q1_ID, 'Paris'), makeAnswer(Q2_ID, 'True')];
      prisma.attempt.findUnique
        .mockResolvedValueOnce(makeAttempt({ answers }))
        .mockResolvedValueOnce(makeAttempt({ answers, score: 2, maxScore: 2 }));
      prisma.question.findMany.mockResolvedValue([
        { id: Q1_ID, correctAnswer: 'Paris' },
        { id: Q2_ID, correctAnswer: 'True' },
      ]);
      prisma.attemptAnswer.update.mockResolvedValue({});
      prisma.result.upsert.mockResolvedValue({});
      prisma.$transaction.mockResolvedValue([]);

      const result = await service.scoreAttempt(ATTEMPT_ID);
      expect(result.score).toBe(2);
      expect(result.maxScore).toBe(2);
    });

    it('scores wrong answers as incorrect', async () => {
      const answers = [makeAnswer(Q1_ID, 'London')];
      prisma.attempt.findUnique
        .mockResolvedValueOnce(makeAttempt({ answers }))
        .mockResolvedValueOnce(makeAttempt({ answers, score: 0, maxScore: 1 }));
      prisma.question.findMany.mockResolvedValue([{ id: Q1_ID, correctAnswer: 'Paris' }]);
      prisma.attemptAnswer.update.mockResolvedValue({});
      prisma.result.upsert.mockResolvedValue({});
      prisma.$transaction.mockResolvedValue([]);

      const result = await service.scoreAttempt(ATTEMPT_ID);
      expect(result.score).toBe(0);
      expect(result.maxScore).toBe(1);
    });

    it('counts a skipped answer as incorrect, still counted in maxScore', async () => {
      const answers = [makeAnswer(Q1_ID, null)];
      prisma.attempt.findUnique
        .mockResolvedValueOnce(makeAttempt({ answers }))
        .mockResolvedValueOnce(makeAttempt({ answers, score: 0, maxScore: 1 }));
      prisma.question.findMany.mockResolvedValue([{ id: Q1_ID, correctAnswer: 'Paris' }]);
      prisma.attemptAnswer.update.mockResolvedValue({});
      prisma.result.upsert.mockResolvedValue({});
      prisma.$transaction.mockResolvedValue([]);

      const result = await service.scoreAttempt(ATTEMPT_ID);
      expect(result.score).toBe(0);
      expect(result.maxScore).toBe(1);
    });

    it('excludes a question with no matching record from maxScore', async () => {
      const answers = [makeAnswer(Q1_ID, 'Paris')];
      prisma.attempt.findUnique
        .mockResolvedValueOnce(makeAttempt({ answers }))
        .mockResolvedValueOnce(makeAttempt({ answers, score: 0, maxScore: 0 }));
      prisma.question.findMany.mockResolvedValue([]);
      prisma.attemptAnswer.update.mockResolvedValue({});
      prisma.result.upsert.mockResolvedValue({});
      prisma.$transaction.mockResolvedValue([]);

      const result = await service.scoreAttempt(ATTEMPT_ID);
      expect(result.score).toBe(0);
      expect(result.maxScore).toBe(0);
    });

    it('handles a realistic mixed quiz: correct, wrong, skipped', async () => {
      const answers = [
        makeAnswer(Q1_ID, 'Paris'),
        makeAnswer(Q2_ID, 'False'),
        makeAnswer(Q3_ID, null),
      ];
      prisma.attempt.findUnique
        .mockResolvedValueOnce(makeAttempt({ answers }))
        .mockResolvedValueOnce(makeAttempt({ answers, score: 1, maxScore: 3 }));
      prisma.question.findMany.mockResolvedValue([
        { id: Q1_ID, correctAnswer: 'Paris' },
        { id: Q2_ID, correctAnswer: 'True' },
        { id: Q3_ID, correctAnswer: 'Berlin' },
      ]);
      prisma.attemptAnswer.update.mockResolvedValue({});
      prisma.result.upsert.mockResolvedValue({});
      prisma.$transaction.mockResolvedValue([]);

      const result = await service.scoreAttempt(ATTEMPT_ID);
      expect(result.score).toBe(1);
      expect(result.maxScore).toBe(3);
    });

    it('persists isCorrect on each answer via the transaction', async () => {
      const answers = [makeAnswer(Q1_ID, 'Paris')];
      prisma.attempt.findUnique
        .mockResolvedValueOnce(makeAttempt({ answers }))
        .mockResolvedValueOnce(makeAttempt({ answers, score: 1, maxScore: 1 }));
      prisma.question.findMany.mockResolvedValue([{ id: Q1_ID, correctAnswer: 'Paris' }]);
      prisma.attemptAnswer.update.mockResolvedValue({});
      prisma.result.upsert.mockResolvedValue({});
      prisma.$transaction.mockResolvedValue([]);

      await service.scoreAttempt(ATTEMPT_ID);

      expect(prisma.attemptAnswer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: answers[0].id },
          data: { isCorrect: true },
        }),
      );
    });

    it('upserts a Result record with score, maxScore, percentage, and passed', async () => {
      const answers = [makeAnswer(Q1_ID, 'Paris'), makeAnswer(Q2_ID, 'True')];
      prisma.attempt.findUnique
        .mockResolvedValueOnce(makeAttempt({ answers }))
        .mockResolvedValueOnce(makeAttempt({ answers, score: 2, maxScore: 2 }));
      prisma.question.findMany.mockResolvedValue([
        { id: Q1_ID, correctAnswer: 'Paris' },
        { id: Q2_ID, correctAnswer: 'True' },
      ]);
      prisma.attemptAnswer.update.mockResolvedValue({});
      prisma.result.upsert.mockResolvedValue({});
      prisma.$transaction.mockResolvedValue([]);

      await service.scoreAttempt(ATTEMPT_ID);

      expect(prisma.result.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { attemptId: ATTEMPT_ID },
          create: expect.objectContaining({
            attemptId: ATTEMPT_ID,
            studentId: STUDENT_ID,
            quizId: QUIZ_ID,
            score: 2,
            maxScore: 2,
            percentage: 100,
            passed: true,
          }),
        }),
      );
    });

    it('marks passed=false when percentage is below the 50% threshold', async () => {
      const answers = [makeAnswer(Q1_ID, 'London'), makeAnswer(Q2_ID, 'False')];
      prisma.attempt.findUnique
        .mockResolvedValueOnce(makeAttempt({ answers }))
        .mockResolvedValueOnce(makeAttempt({ answers, score: 0, maxScore: 2 }));
      prisma.question.findMany.mockResolvedValue([
        { id: Q1_ID, correctAnswer: 'Paris' },
        { id: Q2_ID, correctAnswer: 'True' },
      ]);
      prisma.attemptAnswer.update.mockResolvedValue({});
      prisma.result.upsert.mockResolvedValue({});
      prisma.$transaction.mockResolvedValue([]);

      await service.scoreAttempt(ATTEMPT_ID);

      expect(prisma.result.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ passed: false, percentage: 0 }),
        }),
      );
    });
  });
});

// ===========================================================================
// INTEGRITY SERVICE
// ===========================================================================

describe('IntegrityService', () => {
  let service: IntegrityService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [IntegrityService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<IntegrityService>(IntegrityService);
  });

  afterEach(() => jest.clearAllMocks());

  it('records a cheating event with the minimum required fields', async () => {
    prisma.cheatingEventLog.create.mockResolvedValue({
      id: 'evt_1',
      attemptId: ATTEMPT_ID,
      eventType: CheatingEventType.TAB_HIDDEN,
      occurredAt: new Date(),
      createdAt: new Date(),
    });

    const result = await service.recordCheatingEvent({
      attemptId: ATTEMPT_ID,
      eventType: CheatingEventType.TAB_HIDDEN,
    });

    expect(prisma.cheatingEventLog.create).toHaveBeenCalledWith({
      data: { attemptId: ATTEMPT_ID, eventType: CheatingEventType.TAB_HIDDEN },
    });
    expect(result.eventType).toBe(CheatingEventType.TAB_HIDDEN);
  });

  it('includes optional description and metadata when provided', async () => {
    prisma.cheatingEventLog.create.mockResolvedValue({});

    await service.recordCheatingEvent({
      attemptId: ATTEMPT_ID,
      eventType: CheatingEventType.COPY_PASTE,
      description: 'Detected paste event in answer field',
      metadata: { length: 42 },
    });

    expect(prisma.cheatingEventLog.create).toHaveBeenCalledWith({
      data: {
        attemptId: ATTEMPT_ID,
        eventType: CheatingEventType.COPY_PASTE,
        description: 'Detected paste event in answer field',
        metadata: { length: 42 },
      },
    });
  });

  it('accepts every CheatingEventType value', async () => {
    prisma.cheatingEventLog.create.mockResolvedValue({});
    for (const eventType of Object.values(CheatingEventType)) {
      await expect(
        service.recordCheatingEvent({ attemptId: ATTEMPT_ID, eventType }),
      ).resolves.not.toThrow();
    }
  });

  it('omits occurredAt when not provided, letting the DB default apply', async () => {
    prisma.cheatingEventLog.create.mockResolvedValue({});
    await service.recordCheatingEvent({
      attemptId: ATTEMPT_ID,
      eventType: CheatingEventType.WINDOW_BLUR,
    });
    const callArg = prisma.cheatingEventLog.create.mock.calls[0][0];
    expect(callArg.data.occurredAt).toBeUndefined();
  });
});
