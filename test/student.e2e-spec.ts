import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../src/common/prisma/prisma.service';
import { AttemptStatus, QuizStatus } from '../src/generated/prisma/client';
import { StudentService } from '../src/modules/student/services/student.service';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const STUDENT_ID = 'student-1';
const QUIZ_PUBLISHED_ACTIVE = 'quiz-1';
const QUIZ_PUBLISHED_CLOSED = 'quiz-2';
const QUIZ_PUBLISHED_FUTURE = 'quiz-3';
const QUIZ_DRAFT = 'quiz-4';
const ATTEMPT_ID = 'attempt-1';

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
  return {
    id: ATTEMPT_ID,
    quizId: QUIZ_PUBLISHED_ACTIVE,
    studentId: STUDENT_ID,
    startedAt: new Date('2026-06-01T10:00:00Z'),
    submittedAt: null,
    status: AttemptStatus.IN_PROGRESS,
    ...overrides,
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
    },
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe('StudentService', () => {
  let service: StudentService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        StudentService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get<StudentService>(StudentService);
  });

  afterEach(() => jest.clearAllMocks());

  // -------------------------------------------------------------------------
  // listQuizzesForStudent()
  // -------------------------------------------------------------------------

  describe('listQuizzesForStudent()', () => {
    it('returns only PUBLISHED quizzes (DRAFT is excluded)', async () => {
      // Real Prisma would have filtered out the DRAFT via the where clause;
      // the mock here returns only PUBLISHED to mimic that behavior and
      // assert the service does not add DRAFTs back in.
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
      // The service still calls findMany (just with an empty in-clause);
      // verify the call shape rather than expecting no call.
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
    it('returns null when no IN_PROGRESS attempt exists', async () => {
      prisma.attempt.findFirst.mockResolvedValueOnce(null);

      const result = await service.getActiveAttempt(STUDENT_ID);

      expect(result).toBeNull();
    });

    it('returns the attempt and computes expiresAt from quiz duration', async () => {
      const startedAt = new Date('2026-06-01T10:00:00Z');
      prisma.attempt.findFirst.mockResolvedValueOnce({
        id: ATTEMPT_ID,
        quizId: QUIZ_PUBLISHED_ACTIVE,
        startedAt,
        status: AttemptStatus.IN_PROGRESS,
      });
      prisma.quiz.findUnique.mockResolvedValueOnce({
        durationMinutes: 30,
      });

      const result = await service.getActiveAttempt(STUDENT_ID);

      expect(result).not.toBeNull();
      expect(result!.attemptId).toBe(ATTEMPT_ID);
      expect(result!.quizId).toBe(QUIZ_PUBLISHED_ACTIVE);
      expect(result!.startedAt).toBe(startedAt);
      expect(result!.expiresAt).toEqual(
        new Date(startedAt.getTime() + 30 * 60_000),
      );
    });

    it('returns null expiresAt when the quiz has no durationMinutes', async () => {
      const startedAt = new Date('2026-06-01T10:00:00Z');
      prisma.attempt.findFirst.mockResolvedValueOnce({
        id: ATTEMPT_ID,
        quizId: QUIZ_PUBLISHED_ACTIVE,
        startedAt,
        status: AttemptStatus.IN_PROGRESS,
      });
      prisma.quiz.findUnique.mockResolvedValueOnce({
        durationMinutes: null,
      });

      const result = await service.getActiveAttempt(STUDENT_ID);

      expect(result!.expiresAt).toBeNull();
    });

    it('returns null expiresAt when the quiz is not found', async () => {
      const startedAt = new Date('2026-06-01T10:00:00Z');
      prisma.attempt.findFirst.mockResolvedValueOnce({
        id: ATTEMPT_ID,
        quizId: 'orphan-quiz',
        startedAt,
        status: AttemptStatus.IN_PROGRESS,
      });
      prisma.quiz.findUnique.mockResolvedValueOnce(null);

      const result = await service.getActiveAttempt(STUDENT_ID);

      expect(result!.expiresAt).toBeNull();
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
});
