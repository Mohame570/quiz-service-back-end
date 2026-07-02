import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AttemptStatus, QuestionType } from '../src/generated/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ScoringService } from '../src/modules/attempts/services/scoring.service';
import { AnalyticsGradingService } from '../src/modules/analytics/services/analytics-grading.service';

const ADMIN_ID = 'admin_1';
const ATTEMPT_ID = 'attempt_1';
const ANSWER_ID = 'answer_essay_1';

function makePrisma() {
  return {
    result: { findMany: jest.fn() },
    quiz: { findMany: jest.fn() },
    attempt: { findUnique: jest.fn() },
    attemptAnswer: { findFirst: jest.fn(), update: jest.fn() },
  };
}

describe('AnalyticsGradingService', () => {
  let service: AnalyticsGradingService;
  let scoringService: { recalculateAttemptResult: jest.Mock };
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    scoringService = {
      recalculateAttemptResult: jest.fn().mockResolvedValue({ id: ATTEMPT_ID }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsGradingService,
        { provide: PrismaService, useValue: prisma },
        { provide: ScoringService, useValue: scoringService },
      ],
    }).compile();

    service = module.get(AnalyticsGradingService);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns pending attempts in the grading queue', async () => {
    prisma.result.findMany.mockResolvedValue([
      {
        attemptId: ATTEMPT_ID,
        quizId: 'quiz_1',
        score: 3,
        maxScore: 5,
        pendingEssayCount: 1,
        attempt: {
          submittedAt: new Date('2026-06-01T10:30:00Z'),
          score: 3,
          maxScore: 5,
          student: { user: { email: 'student@example.com', name: 'Student' } },
        },
      },
    ]);
    prisma.quiz.findMany.mockResolvedValue([{ id: 'quiz_1', title: 'Mixed Quiz' }]);

    const result = await service.getGradingQueue();

    expect(result.items).toHaveLength(1);
    expect(result.items[0].attemptId).toBe(ATTEMPT_ID);
    expect(result.items[0].pendingEssayCount).toBe(1);
  });

  it('grades an essay answer and recalculates the attempt result', async () => {
    prisma.attemptAnswer.findFirst.mockResolvedValue({
      id: ANSWER_ID,
      attemptId: ATTEMPT_ID,
      question: { type: QuestionType.ESSAY, points: 2 },
      attempt: { status: AttemptStatus.SUBMITTED },
    });
    prisma.attemptAnswer.update.mockResolvedValue({});

    await service.gradeEssayAnswer(ATTEMPT_ID, ANSWER_ID, 2, ADMIN_ID);

    expect(prisma.attemptAnswer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ANSWER_ID },
        data: expect.objectContaining({
          pointsEarned: 2,
          isCorrect: true,
          gradedById: ADMIN_ID,
        }),
      }),
    );
    expect(scoringService.recalculateAttemptResult).toHaveBeenCalledWith(ATTEMPT_ID);
  });

  it('rejects grading a non-essay answer', async () => {
    prisma.attemptAnswer.findFirst.mockResolvedValue({
      id: ANSWER_ID,
      attemptId: ATTEMPT_ID,
      question: { type: QuestionType.MCQ, points: 1 },
      attempt: { status: AttemptStatus.SUBMITTED },
    });

    await expect(
      service.gradeEssayAnswer(ATTEMPT_ID, ANSWER_ID, 1, ADMIN_ID),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws when the answer is not found', async () => {
    prisma.attemptAnswer.findFirst.mockResolvedValue(null);

    await expect(
      service.gradeEssayAnswer(ATTEMPT_ID, 'missing', 1, ADMIN_ID),
    ).rejects.toThrow(NotFoundException);
  });
});
