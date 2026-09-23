import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AttemptStatus } from '../../../generated/prisma/client';
import { ParsedAnalyticsFilter } from '../dto/analytics-filter.dto';
import { QuestionQualityMetricDto, QuestionQualitySummaryDto } from '../dto/question-quality.dto';

const FINALIZED_STATUSES: AttemptStatus[] = [AttemptStatus.SUBMITTED, AttemptStatus.TIMED_OUT];

@Injectable()
export class QuestionQualityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Implements docs/analytics-calculations.md §1. Every count below comes
   * from AttemptAnswer.isCorrect (persisted at grading time) and
   * Attempt.status — never from re-deriving correctness against the live
   * Question.correctAnswer — so this is safe against a question's answer
   * key being edited after students have already attempted it.
   */
  async getQuestionQuality(filter: ParsedAnalyticsFilter): Promise<QuestionQualitySummaryDto> {
    const quizzes = await this.prisma.quiz.findMany({
      where: {
        id: filter.quizId ?? undefined,
        tags: filter.tags.length > 0 ? { hasSome: filter.tags } : undefined,
      },
      select: {
        id: true,
        title: true,
        quizQuestions: {
          select: { questionId: true, question: { select: { id: true, text: true } } },
        },
      },
    });

    if (quizzes.length === 0) {
      return { totalQuestions: 0, questions: [] };
    }

    const quizIds = quizzes.map((q) => q.id);

    const attempts = await this.prisma.attempt.findMany({
      where: {
        quizId: { in: quizIds },
        status: { in: FINALIZED_STATUSES },
        submittedAt: {
          gte: filter.dateFrom ?? undefined,
          lte: filter.dateTo ?? undefined,
        },
        student: filter.cohort ? { cohort: filter.cohort } : undefined,
      },
      select: {
        id: true,
        quizId: true,
        answers: { select: { questionId: true, isCorrect: true } },
      },
    });

    // finalizedCountByQuiz: denominator for every question in that quiz.
    const finalizedCountByQuiz = new Map<string, number>();
    // answersByQuestion: every AttemptAnswer row seen for a question, across
    // the filtered finalized attempts.
    const answersByQuestion = new Map<string, { isCorrect: boolean | null }[]>();

    for (const attempt of attempts) {
      finalizedCountByQuiz.set(attempt.quizId, (finalizedCountByQuiz.get(attempt.quizId) ?? 0) + 1);
      for (const answer of attempt.answers) {
        const list = answersByQuestion.get(answer.questionId) ?? [];
        list.push({ isCorrect: answer.isCorrect });
        answersByQuestion.set(answer.questionId, list);
      }
    }

    const questions: QuestionQualityMetricDto[] = [];
    for (const quiz of quizzes) {
      const totalFinalizedAttempts = finalizedCountByQuiz.get(quiz.id) ?? 0;
      for (const qq of quiz.quizQuestions) {
        const answers = answersByQuestion.get(qq.questionId) ?? [];
        const correctCount = answers.filter((a) => a.isCorrect === true).length;
        const wrongCount = answers.filter((a) => a.isCorrect === false).length;
        const pendingGradingCount = answers.filter((a) => a.isCorrect === null).length;
        // Skipped = finalized attempts that never produced an
        // AttemptAnswer row for this question at all.
        const skippedCount = Math.max(
          0,
          totalFinalizedAttempts - correctCount - wrongCount - pendingGradingCount,
        );

        const attemptedCount = correctCount + wrongCount;
        questions.push({
          questionId: qq.questionId,
          questionText: qq.question.text,
          quizId: quiz.id,
          quizTitle: quiz.title,
          totalFinalizedAttempts,
          correctCount,
          wrongCount,
          skippedCount,
          pendingGradingCount,
          correctRate: rate(correctCount, totalFinalizedAttempts),
          wrongRate: rate(wrongCount, totalFinalizedAttempts),
          skippedRate: rate(skippedCount, totalFinalizedAttempts),
          pendingGradingRate: rate(pendingGradingCount, totalFinalizedAttempts),
          confusionScore: attemptedCount > 0 ? round2(wrongCount / attemptedCount) : null,
        });
      }
    }

    // §1.3: hardest first (lowest correctRate), most-confusing as tiebreak
    // (higher confusionScore first; null confusionScore — nobody attempted
    // it at all — sorts last among ties since it signals "unattempted"
    // rather than "attempted and got wrong").
    questions.sort((a, b) => {
      if (a.correctRate !== b.correctRate) return a.correctRate - b.correctRate;
      const aScore = a.confusionScore ?? -1;
      const bScore = b.confusionScore ?? -1;
      return bScore - aScore;
    });

    return { totalQuestions: questions.length, questions };
  }
}

function rate(count: number, denominator: number): number {
  return denominator === 0 ? 0 : round2(count / denominator);
}

function round2(value: number): number {
  return Math.round(value * 10000) / 10000; // 4 dp internally; UI formats as %
}
