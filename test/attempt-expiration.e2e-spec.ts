import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ScoringService } from '../src/modules/attempts/services/scoring.service';
import { AttemptExpirationService } from '../src/modules/attempts/services/attempts-expiration.service';
import {
  AttemptStatus,
  QuestionType,
  QuizStatus,
  UserRole,
  GradingStatus,
} from '../src/generated/prisma/client';
import { AppModule } from '../src/app.module';

describe('AttemptExpirationService (integration)', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let scoringService: ScoringService;
  let expirationService: AttemptExpirationService;

  let adminId: string;
  let studentId: string;
  let quizId: string;
  let mcqQuestionId: string;
  let shortTextQuestionId: string;
  let essayQuestionId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        AppModule,
        PrismaService,
        ScoringService,
        AttemptExpirationService,
      ],
    }).compile();

    prisma = module.get(PrismaService);
    scoringService = module.get(ScoringService);
    expirationService = module.get(AttemptExpirationService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await module.close();
  });

  // -------------------------------------------------------------------------
  // Fresh quiz + questions + one student before every test, so each test
  // starts from a known, isolated state and attempts don't leak between tests.
  // -------------------------------------------------------------------------
  beforeEach(async () => {
    const admin = await prisma.user.create({
      data: {
        email: `admin-${Date.now()}-${Math.random()}@test.local`,
        passwordHash: 'irrelevant',
        name: 'Test Admin',
        role: UserRole.ADMIN,
        emailVerified: true,
      },
    });
    adminId = admin.id;

    const student = await prisma.user.create({
      data: {
        email: `student-${Date.now()}-${Math.random()}@test.local`,
        passwordHash: 'irrelevant',
        name: 'Test Student',
        role: UserRole.STUDENT,
        emailVerified: true,
      },
    });
    studentId = student.id;
    await prisma.studentProfile.create({ data: { userId: studentId } });

    const quiz = await prisma.quiz.create({
      data: {
        title: 'Expiration Test Quiz',
        status: QuizStatus.PUBLISHED,
        durationMinutes: 10,
        passingScore: 50,
        createdById: adminId,
        students: { connect: [{ userId: studentId }] },
      },
    });
    quizId = quiz.id;

    const mcq = await prisma.question.create({
      data: {
        type: QuestionType.MCQ,
        text: 'Test MCQ',
        options: ['A', 'B'],
        correctAnswer: 'A',
        points: 1,
      },
    });
    mcqQuestionId = mcq.id;

    const shortText = await prisma.question.create({
      data: {
        type: QuestionType.SHORT_TEXT,
        text: 'Test short text',
        options: [],
        correctAnswer: 'answer',
        points: 1,
      },
    });
    shortTextQuestionId = shortText.id;

    const essay = await prisma.question.create({
      data: {
        type: QuestionType.ESSAY,
        text: 'Test essay',
        options: [],
        correctAnswer: '',
        points: 1,
      },
    });
    essayQuestionId = essay.id;

    await prisma.quizQuestion.createMany({
      data: [
        { quizId, questionId: mcqQuestionId, order: 0 },
        { quizId, questionId: shortTextQuestionId, order: 1 },
        { quizId, questionId: essayQuestionId, order: 2 },
      ],
    });
  });

  // Delete everything this test created — cheap since it's all scoped to one quiz/user pair.
  afterEach(async () => {
    await prisma.result.deleteMany({ where: { quizId } });
    await prisma.attemptAnswer.deleteMany({ where: { attempt: { quizId } } });
    await prisma.attempt.deleteMany({ where: { quizId } });
    await prisma.quizQuestion.deleteMany({ where: { quizId } });
    await prisma.question.deleteMany({
      where: {
        id: { in: [mcqQuestionId, shortTextQuestionId, essayQuestionId] },
      },
    });
    await prisma.quiz.delete({ where: { id: quizId } });
    await prisma.studentProfile.deleteMany({ where: { userId: studentId } });
    await prisma.user.deleteMany({
      where: { id: { in: [studentId, adminId] } },
    });
    jest.restoreAllMocks();
  });

  // Helper: create an expired, in-progress attempt with whatever answers you pass in.
  async function createExpiredAttempt(
    answers: Array<{
      questionId: string;
      selectedOptionId?: string;
      textAnswer?: string;
    }>,
  ) {
    const startedAt = new Date(Date.now() - 60 * 60 * 1000);
    const attempt = await prisma.attempt.create({
      data: {
        quizId,
        studentId,
        status: AttemptStatus.IN_PROGRESS,
        startedAt,
        expiresAt: new Date(startedAt.getTime() + 10 * 60_000), // already in the past
      },
    });

    if (answers.length > 0) {
      await prisma.attemptAnswer.createMany({
        data: answers.map((a) => ({
          attemptId: attempt.id,
          questionId: a.questionId,
          selectedOptionId: a.selectedOptionId ?? null,
          textAnswer: a.textAnswer ?? null,
        })),
      });
    }

    return attempt;
  }

  // ---------------------------------------------------------------------
  // 🔴 MUST: expired + no answers → 0 + valid Result
  // ---------------------------------------------------------------------
  it('finalizes an expired attempt with no answers as 0/max with a COMPLETE Result', async () => {
    const attempt = await createExpiredAttempt([]);

    await expirationService.finalizeExpiredAttempts();

    const updated = await prisma.attempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    const result = await prisma.result.findUnique({
      where: { attemptId: attempt.id },
    });

    const savedAnswers = await prisma.attemptAnswer.findMany({
      where: { attemptId: attempt.id },
      orderBy: { questionId: 'asc' },
    });

    expect(updated.status).toBe(AttemptStatus.TIMED_OUT);
    expect(updated.score).toBe(0);
    expect(updated.maxScore).toBe(3);
    expect(result).not.toBeNull();
    expect(result?.score).toBe(0);
    expect(result?.gradingStatus).toBe(GradingStatus.COMPLETE);
    expect(result?.percentage).toBe(0);
    expect(savedAnswers.every((answer) => answer.pointsEarned === 0)).toBe(
      true,
    );
    expect(savedAnswers.every((answer) => answer.isCorrect === false)).toBe(
      true,
    );
  });

  // ---------------------------------------------------------------------
  // 🔴 MUST: expired + partial answers → unanswered questions score 0
  // ---------------------------------------------------------------------
  it('scores unanswered questions as 0 when only some questions were answered', async () => {
    const attempt = await createExpiredAttempt([
      { questionId: mcqQuestionId, selectedOptionId: 'A' }, // correct — 1 point
      // shortText and essay intentionally left unanswered
    ]);

    await expirationService.finalizeExpiredAttempts();

    const updated = await prisma.attempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    const savedAnswers = await prisma.attemptAnswer.findMany({
      where: { attemptId: attempt.id },
    });

    expect(updated.status).toBe(AttemptStatus.TIMED_OUT);
    expect(updated.score).toBe(1); // only the answered MCQ contributes
    expect(updated.maxScore).toBe(3);
    // No synthetic rows should have been created for the skipped questions —
    // only the one real answer should exist in the database.
    expect(savedAnswers).toHaveLength(1);
    expect(savedAnswers[0].pointsEarned).toBe(1);
    expect(savedAnswers[0].isCorrect).toBe(true);
  });

  // ---------------------------------------------------------------------
  // 🔴 MUST: expired + answered essay → numeric Result, essay pending
  // ---------------------------------------------------------------------
  it('produces a numeric Result while keeping an answered essay pending for manual grading', async () => {
    const attempt = await createExpiredAttempt([
      { questionId: mcqQuestionId, selectedOptionId: 'A' },
      { questionId: shortTextQuestionId, textAnswer: 'answer' },
      {
        questionId: essayQuestionId,
        textAnswer: 'A real essay response with content.',
      },
    ]);

    await expirationService.finalizeExpiredAttempts();

    const result = await prisma.result.findUnique({
      where: { attemptId: attempt.id },
    });
    const essayAnswer = await prisma.attemptAnswer.findFirst({
      where: { attemptId: attempt.id, questionId: essayQuestionId },
    });

    expect(result?.gradingStatus).toBe(GradingStatus.PARTIAL);
    expect(result?.pendingEssayCount).toBe(1);
    expect(result?.score).toBe(2); // MCQ + short text correct, essay pending
    expect(essayAnswer?.pointsEarned).toBeNull(); // null for pending state
    expect(essayAnswer?.isCorrect).toBeNull(); // pending signal
    expect(result?.percentage).toBeCloseTo(66.67, 2);
  });

  // ---------------------------------------------------------------------
  // 🔴 MUST: a non-expired attempt is left untouched
  // ---------------------------------------------------------------------
  it('does not touch an attempt that has not expired yet', async () => {
    const startedAt = new Date();
    const attempt = await prisma.attempt.create({
      data: {
        quizId,
        studentId,
        status: AttemptStatus.IN_PROGRESS,
        startedAt,
        expiresAt: new Date(startedAt.getTime() + 60 * 60 * 1000), // an hour from now
      },
    });

    await expirationService.finalizeExpiredAttempts();

    const unchanged = await prisma.attempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    expect(unchanged.status).toBe(AttemptStatus.IN_PROGRESS);
    expect(unchanged.score).toBeNull();

    const result = await prisma.result.findUnique({
      where: { attemptId: attempt.id },
    });
    expect(result).toBeNull();
  });

  // ---------------------------------------------------------------------
  // 🔴 MUST: a scoring failure rolls back the status claim too
  // ---------------------------------------------------------------------
  it('rolls back the TIMED_OUT status if scoring throws mid-transaction', async () => {
    const attempt = await createExpiredAttempt([
      { questionId: mcqQuestionId, selectedOptionId: 'A' },
    ]);

    jest
      .spyOn(scoringService, 'scoreAttempt')
      .mockRejectedValueOnce(new Error('Simulated scoring failure'));

    // finalizeExpiredAttempts catches per-attempt errors internally and logs them —
    // it should not throw out to the caller.
    await expect(
      expirationService.finalizeExpiredAttempts(),
    ).resolves.not.toThrow();

    const afterFailure = await prisma.attempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    const result = await prisma.result.findUnique({
      where: { attemptId: attempt.id },
    });

    // The claim's status change must have rolled back along with the failed scoring —
    // this is the exact bug the tx-propagation refactor exists to prevent.
    expect(afterFailure.status).toBe(AttemptStatus.IN_PROGRESS);
    expect(afterFailure.submittedAt).toBeNull();
    expect(result).toBeNull();
  });

  // ---------------------------------------------------------------------
  // 🟠 Very important: concurrent finalization only scores the attempt once
  // ---------------------------------------------------------------------
  it('only finalizes an attempt once when two finalization runs race', async () => {
    const attempt = await createExpiredAttempt([
      { questionId: mcqQuestionId, selectedOptionId: 'A' },
    ]);

    const scoreAttemptSpy = jest.spyOn(scoringService, 'scoreAttempt');

    // Fire two finalization passes concurrently — only one should win the claim.
    await Promise.all([
      expirationService.finalizeExpiredAttempts(),
      expirationService.finalizeExpiredAttempts(),
    ]);

    const finalAttempts = await prisma.attemptAnswer.findMany({
      where: { attemptId: attempt.id },
    });
    const results = await prisma.result.findMany({
      where: { attemptId: attempt.id },
    });

    // scoreAttempt should only have been called once for this specific attempt,
    // even though two finalization passes both saw it as a candidate.
    const callsForThisAttempt = scoreAttemptSpy.mock.calls.filter(
      (call) => call[0] === attempt.id,
    );
    expect(callsForThisAttempt).toHaveLength(1);
    expect(results).toHaveLength(1); // no duplicate Result rows
    expect(finalAttempts).toHaveLength(1); // no duplicate answer writes
  });

  // ---------------------------------------------------------------------
  // 🟡 Nice: multiple expired attempts in one run all get finalized
  // ---------------------------------------------------------------------
  it('finalizes every expired attempt found in a single run', async () => {
    const attemptA = await createExpiredAttempt([]);
    const attemptB = await createExpiredAttempt([
      { questionId: mcqQuestionId, selectedOptionId: 'A' },
    ]);

    await expirationService.finalizeExpiredAttempts();

    const [a, b] = await Promise.all([
      prisma.attempt.findUniqueOrThrow({ where: { id: attemptA.id } }),
      prisma.attempt.findUniqueOrThrow({ where: { id: attemptB.id } }),
    ]);

    expect(a.status).toBe(AttemptStatus.TIMED_OUT);
    expect(b.status).toBe(AttemptStatus.TIMED_OUT);
  });

  // ---------------------------------------------------------------------
  // 🟡 Nice: an already-finalized attempt is simply ignored on the next run
  // ---------------------------------------------------------------------
  it('ignores an attempt that is already TIMED_OUT on a subsequent run', async () => {
    const attempt = await createExpiredAttempt([
      { questionId: mcqQuestionId, selectedOptionId: 'A' },
    ]);

    await expirationService.finalizeExpiredAttempts(); // first run finalizes it
    const afterFirstRun = await prisma.attempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    expect(afterFirstRun.status).toBe(AttemptStatus.TIMED_OUT);

    const scoreAttemptSpy = jest.spyOn(scoringService, 'scoreAttempt');
    await expirationService.finalizeExpiredAttempts(); // second run should find nothing

    expect(scoreAttemptSpy).not.toHaveBeenCalled();
  });

  it('uses the original snapshot after the question is changed before timeout', async () => {
    const attempt = await createExpiredAttempt([
      {
        questionId: mcqQuestionId,
        selectedOptionId: 'A',
      },
    ]);

    // Create the snapshot before the question is modified.
    // This represents the answer being submitted/snapshotted earlier.
    await scoringService.scoreAttempt(attempt.id);

    const beforeChange = await prisma.attemptAnswer.findFirstOrThrow({
      where: {
        attemptId: attempt.id,
        questionId: mcqQuestionId,
      },
    });

    expect(beforeChange.snapshotType).toBe(QuestionType.MCQ);
    expect(beforeChange.snapshotCorrectAnswer).toBe('A');
    expect(beforeChange.snapshotPoints).toBe(1);

    // Change the live question after the snapshot exists.
    await prisma.question.update({
      where: { id: mcqQuestionId },
      data: {
        text: 'Changed question text',
        correctAnswer: 'B',
        points: 99,
      },
    });

    // The attempt is already expired, so the cron will finalize it.
    await expirationService.finalizeExpiredAttempts();

    const finalAnswer = await prisma.attemptAnswer.findFirstOrThrow({
      where: {
        attemptId: attempt.id,
        questionId: mcqQuestionId,
      },
    });

    const finalAttempt = await prisma.attempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });

    // The snapshot remains unchanged.
    expect(finalAnswer.snapshotCorrectAnswer).toBe('A');
    expect(finalAnswer.snapshotPoints).toBe(1);

    // The student's original answer "A" is still graded as correct.
    expect(finalAnswer.isCorrect).toBe(true);
    expect(finalAnswer.pointsEarned).toBe(1);

    expect(finalAttempt.status).toBe(AttemptStatus.TIMED_OUT);
  });

  it('creates a missing snapshot when an attempt is automatically timed out', async () => {
    const attempt = await createExpiredAttempt([
      {
        questionId: mcqQuestionId,
        selectedOptionId: 'A',
      },
    ]);

    // Confirm the answer starts without a snapshot.
    const beforeTimeout = await prisma.attemptAnswer.findFirstOrThrow({
      where: {
        attemptId: attempt.id,
        questionId: mcqQuestionId,
      },
    });

    expect(beforeTimeout.snapshotType).toBeNull();
    expect(beforeTimeout.snapshotCorrectAnswer).toBeNull();
    expect(beforeTimeout.snapshotPoints).toBeNull();

    // The cron timeout flow must create the snapshot and score the attempt.
    await expirationService.finalizeExpiredAttempts();

    const afterTimeout = await prisma.attemptAnswer.findFirstOrThrow({
      where: {
        attemptId: attempt.id,
        questionId: mcqQuestionId,
      },
    });

    const updatedAttempt = await prisma.attempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });

    // The timeout flow created the snapshot.
    expect(afterTimeout.snapshotText).toBe('Test MCQ');
    expect(afterTimeout.snapshotOptions).toEqual(['A', 'B']);
    expect(afterTimeout.snapshotType).toBe(QuestionType.MCQ);
    expect(afterTimeout.snapshotCorrectAnswer).toBe('A');
    expect(afterTimeout.snapshotPoints).toBe(1);

    // The answer was graded using the newly created snapshot.
    expect(afterTimeout.isCorrect).toBe(true);
    expect(afterTimeout.pointsEarned).toBe(1);

    // The attempt was finalized normally.
    expect(updatedAttempt.status).toBe(AttemptStatus.TIMED_OUT);
    expect(updatedAttempt.score).toBe(1);
  });

  it('snapshots and grades MULTI_SELECT answers using snapshotCorrectAnswers', async () => {
    const multiSelectQuestion = await prisma.question.create({
      data: {
        type: QuestionType.MULTI_SELECT,
        text: 'Select the correct options',
        options: ['A', 'B', 'C'],
        correctAnswer: '',
        correctAnswers: ['A', 'C'],
        points: 2,
      },
    });

    await prisma.quizQuestion.create({
      data: {
        quizId,
        questionId: multiSelectQuestion.id,
        order: 3,
      },
    });

    try {
      const startedAt = new Date(Date.now() - 60 * 60 * 1000);

      const attempt = await prisma.attempt.create({
        data: {
          quizId,
          studentId,
          status: AttemptStatus.IN_PROGRESS,
          startedAt,
          expiresAt: new Date(startedAt.getTime() + 10 * 60_000),
        },
      });

      await prisma.attemptAnswer.create({
        data: {
          attemptId: attempt.id,
          questionId: multiSelectQuestion.id,

          // The student's selected answers.
          selectedOptionIds: ['A', 'C'],
        },
      });

      const beforeTimeout = await prisma.attemptAnswer.findFirstOrThrow({
        where: {
          attemptId: attempt.id,
          questionId: multiSelectQuestion.id,
        },
      });

      expect(beforeTimeout.snapshotCorrectAnswers).toEqual([]);

      // Automatic timeout creates the snapshot and scores the attempt.
      await expirationService.finalizeExpiredAttempts();

      const afterTimeout = await prisma.attemptAnswer.findFirstOrThrow({
        where: {
          attemptId: attempt.id,
          questionId: multiSelectQuestion.id,
        },
      });

      const result = await prisma.result.findUniqueOrThrow({
        where: { attemptId: attempt.id },
      });

      // The correct answers were copied into the snapshot.
      expect(afterTimeout.snapshotCorrectAnswers).toEqual(['A', 'C']);
      expect(afterTimeout.snapshotType).toBe(QuestionType.MULTI_SELECT);
      expect(afterTimeout.snapshotPoints).toBe(2);

      // MULTI_SELECT grading used snapshotCorrectAnswers.
      expect(afterTimeout.isCorrect).toBe(true);
      expect(afterTimeout.pointsEarned).toBe(2);

      expect(result.score).toBe(2);
    } finally {
      await prisma.attemptAnswer.deleteMany({
        where: {
          questionId: multiSelectQuestion.id,
        },
      });

      await prisma.quizQuestion.deleteMany({
        where: {
          quizId,
          questionId: multiSelectQuestion.id,
        },
      });

      await prisma.question.delete({
        where: { id: multiSelectQuestion.id },
      });
    }
  });
});
