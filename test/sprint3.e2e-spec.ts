// test/sprint3.e2e-spec.ts
//
// Sprint 3: CODE_CONTEXT + FILL_BLANK grading, code snapshot,
// retake limit enforcement, and BEST/LATEST official score selection.
//
// Same pattern as test/sprint2.e2e-spec.ts — mocked PrismaService via
// NestJS Test module, no real database connection.

import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AttemptStatus,
  QuestionType,
  ScoreStrategy,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AttemptsService } from '../src/modules/attempts/services/attempts.service';
import { ScoringService } from '../src/modules/attempts/services/scoring.service';

const STUDENT_ID = 'student_cuid_1';
const QUIZ_ID = 'quiz_cuid_1';
const ATTEMPT_ID = 'attempt_cuid_1';
const FILL_ID = 'question_fill_1';
const CODE_ID = 'question_code_1';

function makeAttempt(overrides: Partial<any> = {}): any {
  return {
    id: ATTEMPT_ID,
    quizId: QUIZ_ID,
    studentId: STUDENT_ID,
    startedAt: new Date('2026-09-01T10:00:00Z'),
    submittedAt: new Date('2026-09-01T10:30:00Z'),
    expiresAt: new Date('2026-09-01T11:00:00Z'),
    status: AttemptStatus.SUBMITTED,
    score: null,
    maxScore: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    answers: [],
    ...overrides,
  };
}

function makeAnswer(
  questionId: string,
  textAnswer: string | null,
  overrides: Partial<any> = {},
): any {
  return {
    id: `${questionId}_ans`,
    attemptId: ATTEMPT_ID,
    questionId,
    selectedOptionId: null,
    textAnswer,
    isCorrect: null,
    pointsEarned: null,
    answeredAt: new Date(),
    ...overrides,
  };
}

function fillBlankQuestion(id: string, correctAnswer: string, points = 2) {
  return { id, type: QuestionType.FILL_BLANK, correctAnswer, points };
}

function codeContextQuestion(id: string, correctAnswer: string, points = 3) {
  return {
    id,
    type: QuestionType.CODE_CONTEXT,
    correctAnswer,
    points,
    codeSnippet: 'for i in range(3):\n    print(i)',
    codeLanguage: 'python',
  };
}

function makeScoringPrisma() {
  return {
    attempt: { findUnique: jest.fn(), update: jest.fn() },
    attemptAnswer: { update: jest.fn() },
    question: { findMany: jest.fn() },
    quiz: { findUnique: jest.fn() },
    result: { upsert: jest.fn() },
    $transaction: jest.fn(),
  };
}

function setupScoreMocks(
  prisma: ReturnType<typeof makeScoringPrisma>,
  answers: any[],
  questions: any[],
  scoredAttempt: any,
) {
  prisma.attempt.findUnique
    .mockResolvedValueOnce(makeAttempt({ answers }))
    .mockResolvedValueOnce(scoredAttempt)
    .mockResolvedValueOnce(scoredAttempt);
  prisma.question.findMany.mockResolvedValue(questions);
  prisma.quiz.findUnique.mockResolvedValue({ passingScore: 50 });
  prisma.attemptAnswer.update.mockResolvedValue({});
  prisma.result.upsert.mockResolvedValue({});
  prisma.$transaction.mockResolvedValue([]);
}

function makeAttemptsPrisma() {
  return {
    attempt: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    attemptAnswer: { update: jest.fn(), upsert: jest.fn() },
    question: { findMany: jest.fn() },
    quiz: { findUnique: jest.fn() },
    result: { upsert: jest.fn() },
    studentProfile: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
}

// ===========================================================================
// FILL_BLANK + CODE_CONTEXT grading
// ===========================================================================

describe('Sprint3 — new question type grading', () => {
  let service: ScoringService;
  let prisma: ReturnType<typeof makeScoringPrisma>;

  beforeEach(async () => {
    prisma = makeScoringPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScoringService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<ScoringService>(ScoringService);
  });

  afterEach(() => jest.clearAllMocks());

  it('grades FILL_BLANK correct with normalized match (trim + case-insensitive)', async () => {
    const answers = [makeAnswer(FILL_ID, '  Paris ')];
    setupScoreMocks(
      prisma,
      answers,
      [fillBlankQuestion(FILL_ID, 'paris', 2)],
      makeAttempt({ answers, score: 2, maxScore: 2 }),
    );

    const result = await service.scoreAttempt(ATTEMPT_ID);
    expect(result.score).toBe(2);
    expect(prisma.attemptAnswer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: answers[0].id },
        data: { isCorrect: true, pointsEarned: 2 },
      }),
    );
  });

  it('grades FILL_BLANK wrong answer as 0', async () => {
    const answers = [makeAnswer(FILL_ID, 'London')];
    setupScoreMocks(
      prisma,
      answers,
      [fillBlankQuestion(FILL_ID, 'paris', 2)],
      makeAttempt({ answers, score: 0, maxScore: 2 }),
    );

    const result = await service.scoreAttempt(ATTEMPT_ID);
    expect(result.score).toBe(0);
  });

  it('grades CODE_CONTEXT correct via textAnswer normalized match', async () => {
    const answers = [makeAnswer(CODE_ID, '0 1 2')];
    setupScoreMocks(
      prisma,
      answers,
      [codeContextQuestion(CODE_ID, '0 1 2', 3)],
      makeAttempt({ answers, score: 3, maxScore: 3 }),
    );

    const result = await service.scoreAttempt(ATTEMPT_ID);
    expect(result.score).toBe(3);
    expect(prisma.attemptAnswer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: answers[0].id },
        data: { isCorrect: true, pointsEarned: 3 },
      }),
    );
  });

  it('grades CODE_CONTEXT wrong answer as 0', async () => {
    const answers = [makeAnswer(CODE_ID, '1 2 3')];
    setupScoreMocks(
      prisma,
      answers,
      [codeContextQuestion(CODE_ID, '0 1 2', 3)],
      makeAttempt({ answers, score: 0, maxScore: 3 }),
    );

    const result = await service.scoreAttempt(ATTEMPT_ID);
    expect(result.score).toBe(0);
  });

  it('freezes codeSnippet/codeLanguage in the snapshot', async () => {
    const answers = [
      makeAnswer(CODE_ID, '0 1 2', {
        snapshotType: null,
        snapshotCorrectAnswer: null,
        snapshotCorrectAnswers: [],
        snapshotPoints: null,
      }),
    ];
    const question = {
      ...codeContextQuestion(CODE_ID, '0 1 2', 3),
      text: 'What does it print?',
      options: [],
      correctAnswers: [],
    };
    setupScoreMocks(
      prisma,
      answers,
      [question],
      makeAttempt({ answers, score: 3, maxScore: 3 }),
    );

    await service.scoreAttempt(ATTEMPT_ID);

    expect(prisma.attemptAnswer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: answers[0].id },
        data: expect.objectContaining({
          snapshotCodeSnippet: question.codeSnippet,
          snapshotCodeLanguage: question.codeLanguage,
        }),
      }),
    );
  });
});

// ===========================================================================
// Retake limit enforcement + official score
// ===========================================================================

describe('Sprint3 — retake policy and official score', () => {
  let service: AttemptsService;
  let prisma: ReturnType<typeof makeAttemptsPrisma>;

  beforeEach(async () => {
    prisma = makeAttemptsPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttemptsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ScoringService, useValue: {} },
      ],
    }).compile();
    service = module.get<AttemptsService>(AttemptsService);
  });

  afterEach(() => jest.clearAllMocks());

  function setupStartQuiz(maxAttempts: number | null) {
    prisma.quiz.findUnique.mockResolvedValue({
      id: QUIZ_ID,
      durationMinutes: 30,
      maxAttempts,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      userId: STUDENT_ID,
      quizzes: [{ quizId: QUIZ_ID }],
    });
    prisma.attempt.create.mockImplementation(async ({ data }: any) =>
      makeAttempt({ ...data, status: AttemptStatus.IN_PROGRESS }),
    );
  }

  it('start() rejects with 403 once the attempt limit is exhausted', async () => {
    setupStartQuiz(2);
    prisma.attempt.count.mockResolvedValue(2);

    await expect(service.start(QUIZ_ID, STUDENT_ID)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.attempt.create).not.toHaveBeenCalled();
  });

  it('start() allows a new attempt while under the limit', async () => {
    setupStartQuiz(2);
    prisma.attempt.count.mockResolvedValue(1);

    const result = await service.start(QUIZ_ID, STUDENT_ID);
    expect(prisma.attempt.create).toHaveBeenCalled();
    expect(result.quizId).toBe(QUIZ_ID);
  });

  it('start() allows unlimited attempts when maxAttempts is null', async () => {
    setupStartQuiz(null);

    await service.start(QUIZ_ID, STUDENT_ID);
    expect(prisma.attempt.count).not.toHaveBeenCalled();
    expect(prisma.attempt.create).toHaveBeenCalled();
  });

  function submittedAttempt(id: string, score: number, submittedAt: string) {
    return makeAttempt({ id, score, submittedAt: new Date(submittedAt) });
  }

  it('getOfficialScore() with BEST returns the highest score', async () => {
    prisma.quiz.findUnique.mockResolvedValue({ scoreStrategy: ScoreStrategy.BEST });
    prisma.attempt.findMany.mockResolvedValue([
      submittedAttempt('a2', 6, '2026-09-02T10:00:00Z'),
      submittedAttempt('a1', 9, '2026-09-01T10:00:00Z'),
    ]);

    const result = await service.getOfficialScore(QUIZ_ID, STUDENT_ID);
    expect(result).toMatchObject({
      quizId: QUIZ_ID,
      strategy: ScoreStrategy.BEST,
      officialScore: 9,
      attemptId: 'a1',
      attemptsCount: 2,
    });
  });

  it('getOfficialScore() with LATEST returns the most recent attempt', async () => {
    prisma.quiz.findUnique.mockResolvedValue({ scoreStrategy: ScoreStrategy.LATEST });
    prisma.attempt.findMany.mockResolvedValue([
      submittedAttempt('a2', 6, '2026-09-02T10:00:00Z'),
      submittedAttempt('a1', 9, '2026-09-01T10:00:00Z'),
    ]);

    const result = await service.getOfficialScore(QUIZ_ID, STUDENT_ID);
    expect(result).toMatchObject({
      quizId: QUIZ_ID,
      strategy: ScoreStrategy.LATEST,
      officialScore: 6,
      attemptId: 'a2',
      attemptsCount: 2,
    });
  });

  it('getOfficialScore() returns nulls when there are no finalized attempts', async () => {
    prisma.quiz.findUnique.mockResolvedValue({ scoreStrategy: ScoreStrategy.BEST });
    prisma.attempt.findMany.mockResolvedValue([]);

    const result = await service.getOfficialScore(QUIZ_ID, STUDENT_ID);
    expect(result).toMatchObject({
      quizId: QUIZ_ID,
      officialScore: null,
      attemptId: null,
      attemptsCount: 0,
    });
  });

  it('getOfficialScore() throws NotFoundException for unknown quiz', async () => {
    prisma.quiz.findUnique.mockResolvedValue(null);

    await expect(
      service.getOfficialScore('bad_quiz', STUDENT_ID),
    ).rejects.toThrow(NotFoundException);
  });
});
