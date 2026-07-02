import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../src/common/prisma/prisma.service';
import { AttemptStatus, QuestionType, QuizStatus } from '../src/generated/prisma/client';
import { StudentAttemptOrchestrator } from '../src/modules/student/services/student-attempt-orchestrator';
import { StudentService } from '../src/modules/student/services/student.service';
import {
  computeExpiresAt,
  isExpired,
  remainingSeconds,
} from '../src/modules/student/services/attempt-timer.util';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const STUDENT_ID = 'student-1';
const OTHER_STUDENT_ID = 'student-2';
const QUIZ_PUBLISHED_ACTIVE = '11111111-1111-4111-1111-111111111111';
const QUIZ_PUBLISHED_CLOSED = '22222222-2222-4222-2222-222222222222';
const QUIZ_PUBLISHED_FUTURE = '33333333-3333-4333-3333-333333333333';
const QUIZ_DRAFT = '44444444-4444-4444-4444-444444444444';
const ATTEMPT_ID = '55555555-5555-4555-5555-555555555555';
const Q1_ID = '66666666-6666-4666-6666-666666666666';
const Q2_ID = '77777777-7777-4777-7777-777777777777';
const Q3_ID = '88888888-8888-4888-8888-888888888888';
const Q4_ID = '99999999-9999-4999-9999-999999999999';

function makeQuiz(overrides: Partial<any> = {}): any {
  return {
    id: 'quiz-default',
    title: 'Default Quiz',
    description: null,
    status: QuizStatus.PUBLISHED,
    durationMinutes: 30,
    passingScore: 70,
    startsAt: null,
    endsAt: null,
    questions: [],
    ...overrides,
  };
}

function makeAttempt(overrides: Partial<any> = {}): any {
  const startedAt = overrides.startedAt ?? new Date('2099-01-01T10:00:00Z');
  const expiresAt =
    overrides.expiresAt ??
    new Date(startedAt.getTime() + 30 * 60_000);
  return {
    id: ATTEMPT_ID,
    quizId: QUIZ_PUBLISHED_ACTIVE,
    studentId: STUDENT_ID,
    startedAt,
    expiresAt,
    submittedAt: null,
    status: AttemptStatus.IN_PROGRESS,
    score: null,
    maxScore: null,
    createdAt: startedAt,
    updatedAt: startedAt,
    answers: [],
    ...overrides,
  };
}

function makeOrchestratorMock() {
  return {
    startAttempt: jest.fn(),
    saveAnswers: jest.fn(),
    submit: jest.fn(),
    getResult: jest.fn(),
    listQuizQuestions: jest.fn(),
  };
}

function makePrismaMock() {
  return {
    quiz: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    attempt: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    question: {
      findMany: jest.fn(),
    },
    result: {
      findUnique: jest.fn(),
    },
  };
}

const RESULT_ROW = {
  percentage: 60,
  passed: true,
  gradedAt: new Date('2026-06-23T10:25:00.500Z'),
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe('StudentService', () => {
  let service: StudentService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let orchestrator: ReturnType<typeof makeOrchestratorMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    orchestrator = makeOrchestratorMock();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        StudentService,
        StudentAttemptOrchestrator,
        { provide: PrismaService, useValue: prisma },
      ],
    })
      .overrideProvider(StudentAttemptOrchestrator)
      .useValue(orchestrator)
      .compile();

    service = moduleRef.get<StudentService>(StudentService);
  });

  afterEach(() => jest.clearAllMocks());

  // -------------------------------------------------------------------------
  // listQuizzesForStudent()
  // -------------------------------------------------------------------------

  describe('listQuizzesForStudent()', () => {
    it('returns only PUBLISHED quizzes (DRAFT is excluded)', async () => {
      prisma.quiz.findMany.mockResolvedValueOnce([
        makeQuiz({ id: QUIZ_PUBLISHED_ACTIVE, status: QuizStatus.PUBLISHED }),
      ]);
      prisma.attempt.findMany.mockResolvedValueOnce([]);

      const result = await service.listQuizzesForStudent(STUDENT_ID);

      expect(prisma.quiz.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: QuizStatus.PUBLISHED,
            students: { some: { userId: STUDENT_ID } },
          },
        }),
      );
      expect(result.items.map((q) => q.id)).toEqual([QUIZ_PUBLISHED_ACTIVE]);
    });

    it('excludes quizzes whose time window has closed', async () => {
      prisma.quiz.findMany.mockResolvedValueOnce([
        makeQuiz({ id: QUIZ_PUBLISHED_ACTIVE }),
        makeQuiz({
          id: QUIZ_PUBLISHED_CLOSED,
          startsAt: new Date('2026-01-01T00:00:00Z'),
          endsAt: new Date('2026-01-02T00:00:00Z'),
        }),
      ]);
      prisma.attempt.findMany.mockResolvedValueOnce([]);

      const result = await service.listQuizzesForStudent(STUDENT_ID);

      expect(result.items.map((q) => q.id)).toEqual([QUIZ_PUBLISHED_ACTIVE]);
    });

    it('excludes quizzes that have not yet started', async () => {
      prisma.quiz.findMany.mockResolvedValueOnce([
        makeQuiz({ id: QUIZ_PUBLISHED_ACTIVE }),
        makeQuiz({
          id: QUIZ_PUBLISHED_FUTURE,
          startsAt: new Date('2099-01-01T00:00:00Z'),
          endsAt: null,
        }),
      ]);
      prisma.attempt.findMany.mockResolvedValueOnce([]);

      const result = await service.listQuizzesForStudent(STUDENT_ID);

      expect(result.items.map((q) => q.id)).toEqual([QUIZ_PUBLISHED_ACTIVE]);
    });

    it('keeps quizzes with null startsAt (open from start)', async () => {
      prisma.quiz.findMany.mockResolvedValueOnce([
        makeQuiz({ id: 'open-start', startsAt: null, endsAt: null }),
      ]);
      prisma.attempt.findMany.mockResolvedValueOnce([]);

      const result = await service.listQuizzesForStudent(STUDENT_ID);

      expect(result.items.map((q) => q.id)).toEqual(['open-start']);
    });

    it('returns NOT_STARTED when no attempt exists for the student', async () => {
      prisma.quiz.findMany.mockResolvedValueOnce([
        makeQuiz({ id: QUIZ_PUBLISHED_ACTIVE, questions: [{ id: 'q1' }] }),
      ]);
      prisma.attempt.findMany.mockResolvedValueOnce([]);

      const result = await service.listQuizzesForStudent(STUDENT_ID);

      expect(result.items[0].attemptStatus).toBe('NOT_STARTED');
      expect(result.items[0].attemptId).toBeNull();
      expect(result.items[0].questionCount).toBe(1);
    });

    it('returns IN_PROGRESS when an in-progress attempt exists', async () => {
      prisma.quiz.findMany.mockResolvedValueOnce([
        makeQuiz({ id: QUIZ_PUBLISHED_ACTIVE }),
      ]);
      prisma.attempt.findMany.mockResolvedValueOnce([
        makeAttempt({ status: AttemptStatus.IN_PROGRESS }),
      ]);

      const result = await service.listQuizzesForStudent(STUDENT_ID);

      expect(result.items[0].attemptStatus).toBe('IN_PROGRESS');
      expect(result.items[0].attemptId).toBe(ATTEMPT_ID);
    });

    it('returns SUBMITTED when a submitted attempt exists', async () => {
      prisma.quiz.findMany.mockResolvedValueOnce([
        makeQuiz({ id: QUIZ_PUBLISHED_ACTIVE }),
      ]);
      prisma.attempt.findMany.mockResolvedValueOnce([
        makeAttempt({
          status: AttemptStatus.SUBMITTED,
          submittedAt: new Date(),
        }),
      ]);

      const result = await service.listQuizzesForStudent(STUDENT_ID);

      expect(result.items[0].attemptStatus).toBe('SUBMITTED');
    });

    it('prefers SUBMITTED over IN_PROGRESS when both exist', async () => {
      prisma.quiz.findMany.mockResolvedValueOnce([
        makeQuiz({ id: QUIZ_PUBLISHED_ACTIVE }),
      ]);
      prisma.attempt.findMany.mockResolvedValueOnce([
        makeAttempt({
          id: 'attempt-old',
          status: AttemptStatus.IN_PROGRESS,
          startedAt: new Date('2026-05-01T10:00:00Z'),
        }),
        makeAttempt({
          id: 'attempt-new',
          status: AttemptStatus.SUBMITTED,
          startedAt: new Date('2026-06-01T10:00:00Z'),
          submittedAt: new Date('2026-06-01T10:30:00Z'),
        }),
      ]);

      const result = await service.listQuizzesForStudent(STUDENT_ID);

      expect(result.items[0].attemptStatus).toBe('SUBMITTED');
    });

    it('returns TIMED_OUT status correctly', async () => {
      prisma.quiz.findMany.mockResolvedValueOnce([
        makeQuiz({ id: QUIZ_PUBLISHED_ACTIVE }),
      ]);
      prisma.attempt.findMany.mockResolvedValueOnce([
        makeAttempt({ status: AttemptStatus.TIMED_OUT }),
      ]);

      const result = await service.listQuizzesForStudent(STUDENT_ID);

      expect(result.items[0].attemptStatus).toBe('TIMED_OUT');
    });

    it('counts questions for each quiz', async () => {
      prisma.quiz.findMany.mockResolvedValueOnce([
        makeQuiz({
          id: 'q-a',
          questions: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }],
        }),
        makeQuiz({ id: 'q-b', questions: [] }),
      ]);
      prisma.attempt.findMany.mockResolvedValueOnce([]);

      const result = await service.listQuizzesForStudent(STUDENT_ID);

      const a = result.items.find((i) => i.id === 'q-a');
      const b = result.items.find((i) => i.id === 'q-b');
      expect(a?.questionCount).toBe(3);
      expect(b?.questionCount).toBe(0);
    });

    it('does not call attempt.findMany when there are no active quizzes', async () => {
      prisma.quiz.findMany.mockResolvedValueOnce([
        makeQuiz({ id: 'open-quiz' }),
      ]);
      prisma.attempt.findMany.mockResolvedValueOnce([]);

      await service.listQuizzesForStudent(STUDENT_ID);

      expect(prisma.attempt.findMany).toHaveBeenCalledTimes(1);
    });

    it('sorts by startsAt ascending (nulls last)', async () => {
      prisma.quiz.findMany.mockResolvedValueOnce([
        makeQuiz({ id: 'a', startsAt: new Date('2026-06-10T00:00:00Z') }),
        makeQuiz({ id: 'b', startsAt: null }),
        makeQuiz({ id: 'c', startsAt: new Date('2026-06-01T00:00:00Z') }),
      ]);
      prisma.attempt.findMany.mockResolvedValueOnce([]);

      const result = await service.listQuizzesForStudent(STUDENT_ID);

      expect(result.items.map((q) => q.id)).toEqual(['c', 'a', 'b']);
    });
  });

  // -------------------------------------------------------------------------
  // getQuizInstructions()
  // -------------------------------------------------------------------------

  describe('getQuizInstructions()', () => {
    it('throws NotFoundException for a DRAFT quiz', async () => {
      prisma.quiz.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.getQuizInstructions(STUDENT_ID, QUIZ_DRAFT),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for an unknown quiz id', async () => {
      prisma.quiz.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.getQuizInstructions(STUDENT_ID, 'missing'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns canStart=true for an active PUBLISHED quiz', async () => {
      prisma.quiz.findFirst.mockResolvedValueOnce(
        makeQuiz({
          id: QUIZ_PUBLISHED_ACTIVE,
          status: QuizStatus.PUBLISHED,
          questions: [{ id: 'q1' }, { id: 'q2' }],
        }),
      );
      prisma.attempt.findMany.mockResolvedValueOnce([]);

      const result = await service.getQuizInstructions(
        STUDENT_ID,
        QUIZ_PUBLISHED_ACTIVE,
      );

      expect(result.canStart).toBe(true);
      expect(result.reasonIfBlocked).toBeNull();
      expect(result.questionCount).toBe(2);
      expect(result.attemptStatus).toBe('NOT_STARTED');
    });

    it('returns canStart=false with reason for a not-yet-started quiz', async () => {
      prisma.quiz.findFirst.mockResolvedValueOnce(
        makeQuiz({
          id: QUIZ_PUBLISHED_FUTURE,
          status: QuizStatus.PUBLISHED,
          startsAt: new Date('2099-01-01T00:00:00Z'),
          endsAt: null,
        }),
      );
      prisma.attempt.findMany.mockResolvedValueOnce([]);

      const result = await service.getQuizInstructions(
        STUDENT_ID,
        QUIZ_PUBLISHED_FUTURE,
      );

      expect(result.canStart).toBe(false);
      expect(result.reasonIfBlocked).toBe('Quiz has not started yet.');
    });

    it('returns canStart=false with reason for a closed quiz', async () => {
      prisma.quiz.findFirst.mockResolvedValueOnce(
        makeQuiz({
          id: QUIZ_PUBLISHED_CLOSED,
          status: QuizStatus.PUBLISHED,
          startsAt: new Date('2026-01-01T00:00:00Z'),
          endsAt: new Date('2026-01-02T00:00:00Z'),
        }),
      );
      prisma.attempt.findMany.mockResolvedValueOnce([]);

      const result = await service.getQuizInstructions(
        STUDENT_ID,
        QUIZ_PUBLISHED_CLOSED,
      );

      expect(result.canStart).toBe(false);
      expect(result.reasonIfBlocked).toBe('Quiz window has closed.');
    });

    it('returns attemptId of the most recent active attempt', async () => {
      prisma.quiz.findFirst.mockResolvedValueOnce(
        makeQuiz({ id: QUIZ_PUBLISHED_ACTIVE, status: QuizStatus.PUBLISHED }),
      );
      prisma.attempt.findMany.mockResolvedValueOnce([
        makeAttempt({
          id: 'old',
          startedAt: new Date('2026-05-01T10:00:00Z'),
          status: AttemptStatus.IN_PROGRESS,
        }),
        makeAttempt({
          id: 'newest',
          startedAt: new Date('2026-06-05T10:00:00Z'),
          status: AttemptStatus.IN_PROGRESS,
        }),
      ]);

      const result = await service.getQuizInstructions(
        STUDENT_ID,
        QUIZ_PUBLISHED_ACTIVE,
      );

      expect(result.attemptId).toBe('newest');
      expect(result.attemptStatus).toBe('IN_PROGRESS');
    });
  });

  // -------------------------------------------------------------------------
  // getActiveAttempt()
  // -------------------------------------------------------------------------

  describe('getActiveAttempt()', () => {
    it('returns null attempt when no IN_PROGRESS attempt exists', async () => {
      prisma.attempt.findFirst.mockResolvedValueOnce(null);

      const result = await service.getActiveAttempt(STUDENT_ID);

      expect(result).toEqual({ attempt: null });
    });

    it('returns the attempt and its expiresAt from the DB row', async () => {
      const startedAt = new Date('2099-01-01T10:00:00Z');
      const expiresAt = new Date(startedAt.getTime() + 30 * 60_000);
      prisma.attempt.findFirst.mockResolvedValueOnce({
        id: ATTEMPT_ID,
        quizId: QUIZ_PUBLISHED_ACTIVE,
        startedAt,
        expiresAt,
        status: AttemptStatus.IN_PROGRESS,
      });

      const result = await service.getActiveAttempt(STUDENT_ID);

      expect(result.attempt).not.toBeNull();
      expect(result.attempt!.attemptId).toBe(ATTEMPT_ID);
      expect(result.attempt!.quizId).toBe(QUIZ_PUBLISHED_ACTIVE);
      expect(result.attempt!.startedAt).toBe(startedAt);
      expect(result.attempt!.expiresAt).toEqual(expiresAt);
    });

    it('auto-finalises an expired attempt and returns { attempt: null }', async () => {
      const startedAt = new Date('2026-06-01T10:00:00Z');
      const expiresAt = new Date('2026-06-01T10:00:00Z');
      prisma.attempt.findFirst.mockResolvedValueOnce({
        id: ATTEMPT_ID,
        quizId: QUIZ_PUBLISHED_ACTIVE,
        startedAt,
        expiresAt,
        status: AttemptStatus.IN_PROGRESS,
      });
      prisma.attempt.update.mockResolvedValueOnce({
        id: ATTEMPT_ID,
        status: AttemptStatus.TIMED_OUT,
        submittedAt: new Date(),
      });

      const result = await service.getActiveAttempt(STUDENT_ID);

      expect(result).toEqual({ attempt: null });
      expect(prisma.attempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ATTEMPT_ID },
          data: expect.objectContaining({ status: AttemptStatus.TIMED_OUT }),
        }),
      );
    });

    it('queries with status=IN_PROGRESS and orderBy startedAt desc', async () => {
      prisma.attempt.findFirst.mockResolvedValueOnce(null);

      await service.getActiveAttempt(STUDENT_ID);

      expect(prisma.attempt.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            studentId: STUDENT_ID,
            status: AttemptStatus.IN_PROGRESS,
          },
          orderBy: { startedAt: 'desc' },
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // startAttempt()
  // -------------------------------------------------------------------------

  describe('startAttempt()', () => {
    it('creates an attempt and stamps expiresAt = startedAt + duration*60_000', async () => {
      const startedAt = new Date('2026-06-01T10:00:00Z');
      const quiz = makeQuiz({
        id: QUIZ_PUBLISHED_ACTIVE,
        durationMinutes: 30,
      });
      prisma.quiz.findFirst.mockResolvedValueOnce(quiz);
      prisma.attempt.findFirst.mockResolvedValueOnce(null);
      orchestrator.startAttempt.mockResolvedValueOnce({
        id: ATTEMPT_ID,
        quizId: quiz.id,
        studentId: STUDENT_ID,
        startedAt,
        submittedAt: null,
        status: AttemptStatus.IN_PROGRESS,
      });
      prisma.attempt.update.mockResolvedValueOnce({});

      await service.startAttempt(STUDENT_ID, quiz.id);

      expect(prisma.attempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ATTEMPT_ID },
          data: { expiresAt: new Date(startedAt.getTime() + 30 * 60_000) },
        }),
      );
    });

    it('throws NotFoundException for an unknown / unassigned quiz', async () => {
      prisma.quiz.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.startAttempt(STUDENT_ID, QUIZ_DRAFT),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when an IN_PROGRESS attempt already exists', async () => {
      prisma.quiz.findFirst.mockResolvedValueOnce(
        makeQuiz({ id: QUIZ_PUBLISHED_ACTIVE }),
      );
      prisma.attempt.findFirst.mockResolvedValueOnce({
        id: 'existing-attempt',
        status: AttemptStatus.IN_PROGRESS,
      });

      await expect(
        service.startAttempt(STUDENT_ID, QUIZ_PUBLISHED_ACTIVE),
      ).rejects.toThrow(ConflictException);
    });

    it('delegates creation to the orchestrator', async () => {
      prisma.quiz.findFirst.mockResolvedValueOnce(
        makeQuiz({ id: QUIZ_PUBLISHED_ACTIVE }),
      );
      prisma.attempt.findFirst.mockResolvedValueOnce(null);
      orchestrator.startAttempt.mockResolvedValueOnce({
        id: ATTEMPT_ID,
        quizId: QUIZ_PUBLISHED_ACTIVE,
        studentId: STUDENT_ID,
        startedAt: new Date(),
        submittedAt: null,
        status: AttemptStatus.IN_PROGRESS,
      });
      prisma.attempt.update.mockResolvedValueOnce({});

      await service.startAttempt(STUDENT_ID, QUIZ_PUBLISHED_ACTIVE);

      expect(orchestrator.startAttempt).toHaveBeenCalledWith(
        QUIZ_PUBLISHED_ACTIVE,
        STUDENT_ID,
      );
    });
  });

  // -------------------------------------------------------------------------
  // getAttemptQuestions()
  // -------------------------------------------------------------------------

  describe('getAttemptQuestions()', () => {
    it('returns questions without correctAnswer, sorted by createdAt', async () => {
      const startedAt = new Date('2099-01-01T10:00:00Z');
      const expiresAt = new Date(startedAt.getTime() + 30 * 60_000);
      const attempt = makeAttempt({ startedAt, expiresAt });
      prisma.attempt.findUnique.mockResolvedValueOnce(attempt);
      orchestrator.listQuizQuestions.mockResolvedValueOnce([
        {
          id: Q2_ID,
          quizId: attempt.quizId,
          type: 'MCQ' as const,
          text: 'Q2',
          options: ['a', 'b'],
          correctAnswer: 'a',
          createdAt: new Date('2099-01-01T10:01:00Z'),
        },
        {
          id: Q1_ID,
          quizId: attempt.quizId,
          type: 'TRUE_FALSE' as const,
          text: 'Q1',
          options: ['True', 'False'],
          correctAnswer: 'True',
          createdAt: new Date('2099-01-01T10:00:00Z'),
        },
      ]);

      const result = await service.getAttemptQuestions(STUDENT_ID, ATTEMPT_ID);

      expect(result.questions).toHaveLength(2);
      expect(result.questions[0].id).toBe(Q1_ID);
      expect(result.questions[1].id).toBe(Q2_ID);
      expect(result.questions[0].order).toBe(0);
      expect(result.questions[1].order).toBe(1);
      expect((result.questions[0] as any).correctAnswer).toBeUndefined();
    });

    it('returns expiresAt and remainingSeconds for countdown', async () => {
      const realNow = new Date();
      const startedAt = new Date(realNow.getTime() - 5 * 60_000);
      const expiresAt = new Date(realNow.getTime() + 30 * 60_000);
      prisma.attempt.findUnique.mockResolvedValueOnce(
        makeAttempt({ startedAt, expiresAt }),
      );
      orchestrator.listQuizQuestions.mockResolvedValueOnce([]);

      const result = await service.getAttemptQuestions(STUDENT_ID, ATTEMPT_ID);

      expect(result.expiresAt).toEqual(expiresAt);
      expect(result.remainingSeconds).toBeGreaterThan(0);
      expect(result.remainingSeconds).toBeLessThanOrEqual(30 * 60);
    });

    it('throws NotFoundException for an unknown attempt', async () => {
      prisma.attempt.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.getAttemptQuestions(STUDENT_ID, 'bad-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for another student\'s attempt', async () => {
      prisma.attempt.findUnique.mockResolvedValueOnce(
        makeAttempt({ studentId: OTHER_STUDENT_ID }),
      );

      await expect(
        service.getAttemptQuestions(STUDENT_ID, ATTEMPT_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('auto-finalises an expired attempt then throws ConflictException', async () => {
      const startedAt = new Date('2026-06-01T10:00:00Z');
      const expiresAt = new Date('2026-06-01T10:00:00Z');
      prisma.attempt.findUnique.mockResolvedValueOnce(
        makeAttempt({ startedAt, expiresAt }),
      );
      prisma.attempt.update.mockResolvedValueOnce({
        ...makeAttempt({ startedAt, expiresAt }),
        status: AttemptStatus.TIMED_OUT,
        submittedAt: new Date(),
      });

      await expect(
        service.getAttemptQuestions(STUDENT_ID, ATTEMPT_ID),
      ).rejects.toThrow(ConflictException);
    });
  });

  // -------------------------------------------------------------------------
  // saveAttemptAnswers()
  // -------------------------------------------------------------------------

  describe('saveAttemptAnswers()', () => {
    it('delegates to the orchestrator with normalized items', async () => {
      const startedAt = new Date();
      const expiresAt = new Date(startedAt.getTime() + 30 * 60_000);
      prisma.attempt.findUnique.mockResolvedValueOnce(
        makeAttempt({ startedAt, expiresAt }),
      );
      prisma.question.findMany.mockResolvedValueOnce([
        { id: Q1_ID, type: QuestionType.MCQ },
      ]);
      orchestrator.saveAnswers.mockResolvedValueOnce([
        {
          id: 'a1',
          attemptId: ATTEMPT_ID,
          questionId: Q1_ID,
          selectedOptionId: 'opt-1',
          textAnswer: null,
          isCorrect: null,
          answeredAt: new Date(),
        },
      ]);

      const result = await service.saveAttemptAnswers(STUDENT_ID, ATTEMPT_ID, [
        { questionId: Q1_ID, selectedOptionId: 'opt-1' },
      ]);

      expect(orchestrator.saveAnswers).toHaveBeenCalledWith(
        ATTEMPT_ID,
        STUDENT_ID,
        [{ questionId: Q1_ID, selectedOptionId: 'opt-1', textAnswer: null }],
      );
      expect(result).toHaveLength(1);
      expect(result[0].questionId).toBe(Q1_ID);
    });

    it('treats undefined selectedOptionId as null (skipped question)', async () => {
      const startedAt = new Date();
      const expiresAt = new Date(startedAt.getTime() + 30 * 60_000);
      prisma.attempt.findUnique.mockResolvedValueOnce(
        makeAttempt({ startedAt, expiresAt }),
      );
      prisma.question.findMany.mockResolvedValueOnce([
        { id: Q1_ID, type: QuestionType.MCQ },
      ]);
      orchestrator.saveAnswers.mockResolvedValueOnce([]);

      await service.saveAttemptAnswers(STUDENT_ID, ATTEMPT_ID, [
        { questionId: Q1_ID },
      ]);

      expect(orchestrator.saveAnswers).toHaveBeenCalledWith(
        ATTEMPT_ID,
        STUDENT_ID,
        [{ questionId: Q1_ID, selectedOptionId: null, textAnswer: null }],
      );
    });

    it('throws ConflictException for a SUBMITTED attempt', async () => {
      prisma.attempt.findUnique.mockResolvedValueOnce(
        makeAttempt({ status: AttemptStatus.SUBMITTED }),
      );

      await expect(
        service.saveAttemptAnswers(STUDENT_ID, ATTEMPT_ID, [
          { questionId: Q1_ID, selectedOptionId: 'opt-1' },
        ]),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException for a TIMED_OUT attempt', async () => {
      prisma.attempt.findUnique.mockResolvedValueOnce(
        makeAttempt({ status: AttemptStatus.TIMED_OUT }),
      );

      await expect(
        service.saveAttemptAnswers(STUDENT_ID, ATTEMPT_ID, [
          { questionId: Q1_ID, selectedOptionId: 'opt-1' },
        ]),
      ).rejects.toThrow(ConflictException);
    });

    it('auto-finalises an expired attempt then throws ConflictException', async () => {
      const startedAt = new Date('2026-06-01T10:00:00Z');
      const expiresAt = new Date('2026-06-01T10:00:00Z');
      prisma.attempt.findUnique.mockResolvedValueOnce(
        makeAttempt({ startedAt, expiresAt }),
      );
      prisma.attempt.update.mockResolvedValueOnce({
        ...makeAttempt({ startedAt, expiresAt }),
        status: AttemptStatus.TIMED_OUT,
        submittedAt: new Date(),
      });

      await expect(
        service.saveAttemptAnswers(STUDENT_ID, ATTEMPT_ID, [
          { questionId: Q1_ID, selectedOptionId: 'opt-1' },
        ]),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when a questionId is not part of the quiz', async () => {
      const startedAt = new Date();
      const expiresAt = new Date(startedAt.getTime() + 30 * 60_000);
      prisma.attempt.findUnique.mockResolvedValueOnce(
        makeAttempt({ startedAt, expiresAt }),
      );
      prisma.question.findMany.mockResolvedValueOnce([]);

      await expect(
        service.saveAttemptAnswers(STUDENT_ID, ATTEMPT_ID, [
          { questionId: 'unrelated-question', selectedOptionId: 'opt-1' },
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('saves textAnswer for SHORT_TEXT questions', async () => {
      const startedAt = new Date();
      const expiresAt = new Date(startedAt.getTime() + 30 * 60_000);
      prisma.attempt.findUnique.mockResolvedValueOnce(
        makeAttempt({ startedAt, expiresAt }),
      );
      prisma.question.findMany.mockResolvedValueOnce([
        { id: Q3_ID, type: QuestionType.SHORT_TEXT },
      ]);
      orchestrator.saveAnswers.mockResolvedValueOnce([
        {
          id: 'a3',
          attemptId: ATTEMPT_ID,
          questionId: Q3_ID,
          selectedOptionId: null,
          textAnswer: 'Paris',
          isCorrect: null,
          answeredAt: new Date(),
        },
      ]);

      const result = await service.saveAttemptAnswers(STUDENT_ID, ATTEMPT_ID, [
        { questionId: Q3_ID, textAnswer: 'Paris' },
      ]);

      expect(orchestrator.saveAnswers).toHaveBeenCalledWith(
        ATTEMPT_ID,
        STUDENT_ID,
        [{ questionId: Q3_ID, selectedOptionId: null, textAnswer: 'Paris' }],
      );
      expect(result[0].textAnswer).toBe('Paris');
    });

    it('saves textAnswer for ESSAY questions', async () => {
      const startedAt = new Date();
      const expiresAt = new Date(startedAt.getTime() + 30 * 60_000);
      prisma.attempt.findUnique.mockResolvedValueOnce(
        makeAttempt({ startedAt, expiresAt }),
      );
      prisma.question.findMany.mockResolvedValueOnce([
        { id: Q4_ID, type: QuestionType.ESSAY },
      ]);
      orchestrator.saveAnswers.mockResolvedValueOnce([
        {
          id: 'a4',
          attemptId: ATTEMPT_ID,
          questionId: Q4_ID,
          selectedOptionId: null,
          textAnswer: 'Long essay response',
          isCorrect: null,
          answeredAt: new Date(),
        },
      ]);

      const result = await service.saveAttemptAnswers(STUDENT_ID, ATTEMPT_ID, [
        { questionId: Q4_ID, textAnswer: 'Long essay response' },
      ]);

      expect(orchestrator.saveAnswers).toHaveBeenCalledWith(
        ATTEMPT_ID,
        STUDENT_ID,
        [
          {
            questionId: Q4_ID,
            selectedOptionId: null,
            textAnswer: 'Long essay response',
          },
        ],
      );
      expect(result[0].textAnswer).toBe('Long essay response');
    });

    it('throws BadRequestException when MCQ payload uses textAnswer', async () => {
      const startedAt = new Date();
      const expiresAt = new Date(startedAt.getTime() + 30 * 60_000);
      prisma.attempt.findUnique.mockResolvedValueOnce(
        makeAttempt({ startedAt, expiresAt }),
      );
      prisma.question.findMany.mockResolvedValueOnce([
        { id: Q1_ID, type: QuestionType.MCQ },
      ]);

      await expect(
        service.saveAttemptAnswers(STUDENT_ID, ATTEMPT_ID, [
          { questionId: Q1_ID, textAnswer: 'wrong field' },
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when text question payload uses selectedOptionId', async () => {
      const startedAt = new Date();
      const expiresAt = new Date(startedAt.getTime() + 30 * 60_000);
      prisma.attempt.findUnique.mockResolvedValueOnce(
        makeAttempt({ startedAt, expiresAt }),
      );
      prisma.question.findMany.mockResolvedValueOnce([
        { id: Q3_ID, type: QuestionType.SHORT_TEXT },
      ]);

      await expect(
        service.saveAttemptAnswers(STUDENT_ID, ATTEMPT_ID, [
          { questionId: Q3_ID, selectedOptionId: 'Paris' },
        ]),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  // submitAttempt()
  // -------------------------------------------------------------------------

  describe('submitAttempt()', () => {
    it('delegates to the orchestrator and surfaces the Result summary', async () => {
      const startedAt = new Date();
      const expiresAt = new Date(startedAt.getTime() + 30 * 60_000);
      prisma.attempt.findUnique.mockResolvedValueOnce(
        makeAttempt({ startedAt, expiresAt }),
      );
      orchestrator.submit.mockResolvedValueOnce({
        id: ATTEMPT_ID,
        quizId: QUIZ_PUBLISHED_ACTIVE,
        studentId: STUDENT_ID,
        startedAt,
        submittedAt: new Date(),
        status: AttemptStatus.SUBMITTED,
        score: null,
        maxScore: null,
        createdAt: startedAt,
        updatedAt: new Date(),
        answers: [],
      });
      prisma.attempt.findUnique.mockResolvedValueOnce({
        expiresAt,
      });
      prisma.result.findUnique.mockResolvedValueOnce(RESULT_ROW);

      const result = await service.submitAttempt(STUDENT_ID, ATTEMPT_ID, []);

      expect(result.status).toBe(AttemptStatus.SUBMITTED);
      expect(result.expiresAt).toEqual(expiresAt);
      expect(result.result).toEqual(RESULT_ROW);
    });

    it('returns result: null when no Result row exists yet', async () => {
      const startedAt = new Date();
      const expiresAt = new Date(startedAt.getTime() + 30 * 60_000);
      prisma.attempt.findUnique.mockResolvedValueOnce(
        makeAttempt({ startedAt, expiresAt }),
      );
      orchestrator.submit.mockResolvedValueOnce({
        id: ATTEMPT_ID,
        quizId: QUIZ_PUBLISHED_ACTIVE,
        studentId: STUDENT_ID,
        startedAt,
        submittedAt: new Date(),
        status: AttemptStatus.SUBMITTED,
        score: null,
        maxScore: null,
        createdAt: startedAt,
        updatedAt: new Date(),
        answers: [],
      });
      prisma.attempt.findUnique.mockResolvedValueOnce({
        expiresAt,
      });
      prisma.result.findUnique.mockResolvedValueOnce(null);

      const result = await service.submitAttempt(STUDENT_ID, ATTEMPT_ID, []);

      expect(result.result).toBeNull();
    });

    it('throws ConflictException for an already SUBMITTED attempt', async () => {
      prisma.attempt.findUnique.mockResolvedValueOnce(
        makeAttempt({ status: AttemptStatus.SUBMITTED }),
      );

      await expect(
        service.submitAttempt(STUDENT_ID, ATTEMPT_ID, []),
      ).rejects.toThrow(ConflictException);
    });

    it('auto-finalises an expired attempt and returns it as TIMED_OUT', async () => {
      const startedAt = new Date('2026-06-01T10:00:00Z');
      const expiresAt = new Date('2026-06-01T10:00:00Z');
      prisma.attempt.findUnique.mockResolvedValueOnce(
        makeAttempt({ startedAt, expiresAt }),
      );
      prisma.attempt.update.mockResolvedValueOnce({
        ...makeAttempt({ startedAt, expiresAt }),
        status: AttemptStatus.TIMED_OUT,
        submittedAt: new Date(),
      });
      orchestrator.getResult.mockResolvedValueOnce({
        id: ATTEMPT_ID,
        quizId: QUIZ_PUBLISHED_ACTIVE,
        studentId: STUDENT_ID,
        startedAt,
        submittedAt: new Date(),
        status: AttemptStatus.TIMED_OUT,
        score: null,
        maxScore: null,
        createdAt: startedAt,
        updatedAt: new Date(),
        answers: [],
      });
      prisma.attempt.findUnique.mockResolvedValueOnce({
        expiresAt,
      });
      prisma.result.findUnique.mockResolvedValueOnce(null);

      const result = await service.submitAttempt(STUDENT_ID, ATTEMPT_ID, []);

      expect(result.status).toBe(AttemptStatus.TIMED_OUT);
      expect(result.result).toBeNull();
      expect(orchestrator.submit).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getAttemptResult()
  // -------------------------------------------------------------------------

  describe('getAttemptResult()', () => {
    it('returns the result for a SUBMITTED attempt with the Result summary', async () => {
      prisma.attempt.findUnique
        .mockResolvedValueOnce(
          makeAttempt({
            status: AttemptStatus.SUBMITTED,
            submittedAt: new Date(),
          }),
        )
        .mockResolvedValueOnce({
          expiresAt: new Date('2099-01-01T10:30:00Z'),
        });
      orchestrator.getResult.mockResolvedValueOnce({
        id: ATTEMPT_ID,
        quizId: QUIZ_PUBLISHED_ACTIVE,
        studentId: STUDENT_ID,
        startedAt: new Date(),
        submittedAt: new Date(),
        status: AttemptStatus.SUBMITTED,
        score: null,
        maxScore: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        answers: [
          {
            id: 'a1',
            attemptId: ATTEMPT_ID,
            questionId: Q1_ID,
            selectedOptionId: 'opt-1',
            isCorrect: null,
            answeredAt: new Date(),
          },
        ],
      });
      prisma.result.findUnique.mockResolvedValueOnce(RESULT_ROW);

      const result = await service.getAttemptResult(STUDENT_ID, ATTEMPT_ID);

      expect(result.status).toBe(AttemptStatus.SUBMITTED);
      expect(result.answers).toHaveLength(1);
      expect(result.result).toEqual(RESULT_ROW);
    });

    it('returns result: null for a SUBMITTED attempt with no Result row', async () => {
      prisma.attempt.findUnique
        .mockResolvedValueOnce(
          makeAttempt({
            status: AttemptStatus.SUBMITTED,
            submittedAt: new Date(),
          }),
        )
        .mockResolvedValueOnce({
          expiresAt: new Date('2099-01-01T10:30:00Z'),
        });
      orchestrator.getResult.mockResolvedValueOnce({
        id: ATTEMPT_ID,
        quizId: QUIZ_PUBLISHED_ACTIVE,
        studentId: STUDENT_ID,
        startedAt: new Date(),
        submittedAt: new Date(),
        status: AttemptStatus.SUBMITTED,
        score: null,
        maxScore: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        answers: [],
      });
      prisma.result.findUnique.mockResolvedValueOnce(null);

      const result = await service.getAttemptResult(STUDENT_ID, ATTEMPT_ID);

      expect(result.result).toBeNull();
    });

    it('throws ForbiddenException for another student\'s attempt', async () => {
      prisma.attempt.findUnique.mockResolvedValueOnce(
        makeAttempt({ studentId: OTHER_STUDENT_ID }),
      );

      await expect(
        service.getAttemptResult(STUDENT_ID, ATTEMPT_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException if attempt is still IN_PROGRESS', async () => {
      prisma.attempt.findUnique.mockResolvedValueOnce(makeAttempt());

      await expect(
        service.getAttemptResult(STUDENT_ID, ATTEMPT_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('returns the result of a TIMED_OUT attempt (no extra write)', async () => {
      prisma.attempt.findUnique
        .mockResolvedValueOnce(makeAttempt({ status: AttemptStatus.TIMED_OUT }))
        .mockResolvedValueOnce({
          expiresAt: new Date('2099-01-01T10:30:00Z'),
        });
      orchestrator.getResult.mockResolvedValueOnce({
        id: ATTEMPT_ID,
        quizId: QUIZ_PUBLISHED_ACTIVE,
        studentId: STUDENT_ID,
        startedAt: new Date(),
        submittedAt: new Date(),
        status: AttemptStatus.TIMED_OUT,
        score: null,
        maxScore: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        answers: [],
      });
      prisma.result.findUnique.mockResolvedValueOnce(null);

      const result = await service.getAttemptResult(STUDENT_ID, ATTEMPT_ID);

      expect(result.status).toBe(AttemptStatus.TIMED_OUT);
      expect(result.result).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Timer utility tests
// ---------------------------------------------------------------------------

describe('attempt-timer util', () => {
  describe('computeExpiresAt()', () => {
    it('returns startedAt + durationMinutes * 60_000 ms', () => {
      const startedAt = new Date('2026-06-01T10:00:00Z');
      const result = computeExpiresAt(startedAt, 30);
      expect(result.getTime()).toBe(startedAt.getTime() + 30 * 60_000);
    });

    it('returns startedAt when duration is 0', () => {
      const startedAt = new Date('2026-06-01T10:00:00Z');
      expect(computeExpiresAt(startedAt, 0).getTime()).toBe(
        startedAt.getTime(),
      );
    });
  });

  describe('isExpired()', () => {
    const startedAt = new Date('2026-06-01T10:00:00Z');
    const expiresAt = new Date(startedAt.getTime() + 30 * 60_000);

    it('returns true when now > expiresAt', () => {
      expect(
        isExpired(expiresAt, new Date(expiresAt.getTime() + 1)),
      ).toBe(true);
    });

    it('returns false when now <= expiresAt', () => {
      expect(
        isExpired(expiresAt, new Date(expiresAt.getTime() - 1)),
      ).toBe(false);
    });
  });

  describe('remainingSeconds()', () => {
    it('returns the seconds remaining', () => {
      const expiresAt = new Date('2026-06-01T10:30:00Z');
      const now = new Date('2026-06-01T10:00:00Z');
      expect(remainingSeconds(expiresAt, now)).toBe(30 * 60);
    });

    it('clamps to 0 when negative', () => {
      const expiresAt = new Date('2026-06-01T10:00:00Z');
      const now = new Date('2026-06-01T10:01:00Z');
      expect(remainingSeconds(expiresAt, now)).toBe(0);
    });
  });
});
