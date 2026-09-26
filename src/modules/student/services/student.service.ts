import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AttemptStatus, QuestionType, QuizStatus } from '../../../generated/prisma/client';
import {
  AttemptAnswerResponseDto,
  AttemptResponseDto,
} from '../../attempts/dto/attempt-response.dto';
import { SaveAnswerItemDto } from '../../attempts/dto/save-answers.dto';
import {
  StudentActiveAttemptDto,
  StudentActiveAttemptResponseDto,
  StudentAttemptQuestionDto,
  StudentAttemptQuestionsResponseDto,
  StudentQuizInstructionsDto,
  StudentQuizInvitationResponseDto,
  StudentQuizListItemDto,
  StudentQuizListResponseDto,
  deriveAttemptStatus,
} from '../dto';
import { StudentAttemptOrchestrator } from './student-attempt-orchestrator';
import {
  computeExpiresAt,
  isExpired,
  remainingSeconds,
} from './attempt-timer.util';
import { normalizeShortTextAnswer } from '../../attempts/utils/text-answer.util';
import { InvitationService } from '../../auth/services/invitation.service';

/// Student-facing response shape: the attempts module's full response with
/// the student-only `expiresAt` field and the `Result` summary appended.
/// The service returns the orchestrator's `AttemptResponseDto` and merges
/// `expiresAt` + the `Result` row on top of it.
export interface StudentAttemptResultSummary {
  percentage: number;
  passed: boolean | null;
  gradedAt: Date;
  gradingStatus: 'PARTIAL' | 'COMPLETE';
  pendingEssayCount: number;
}

type StudentAttemptResponse = AttemptResponseDto & {
  expiresAt: Date;
  result: StudentAttemptResultSummary | null;
};

interface AttemptRow {
  id: string;
  quizId: string;
  studentId: string;
  startedAt: Date;
  expiresAt: Date;
  submittedAt: Date | null;
  status: AttemptStatus;
  score: number | null;
  maxScore: number | null;
  createdAt: Date;
  updatedAt: Date;
  answers?: AttemptAnswerResponseDto[];
}

interface QuizRow {
  id: string;
  title: string;
  description: string | null;
  status: QuizStatus;
  durationMinutes: number | null;
  passingScore: number | null;
  maxAttempts: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  quizQuestions?: { questionId: string }[];
}

interface QuestionRow {
  id: string;
  type: 'MCQ' | 'TRUE_FALSE';
  text: string;
  options: string[];
  correctAnswer: string;
  createdAt: Date;
}

@Injectable()
export class StudentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: StudentAttemptOrchestrator,
    private readonly invitationService: InvitationService,
  ) {}

  // -------------------------------------------------------------------------
  // GET /api/student/quizzes
  // -------------------------------------------------------------------------

  async listQuizzesForStudent(
    studentId: string,
  ): Promise<StudentQuizListResponseDto> {
    const quizzes = await this.prisma.quiz.findMany({
      where: {
        status: QuizStatus.PUBLISHED,
        students: { some: { userId: studentId } },
      },
      include: { quizQuestions: { select: { questionId: true } } },
    });

    const now = new Date();
    const activeQuizzes = quizzes.filter((q) => this.isWithinWindow(q, now));
    const quizIds = activeQuizzes.map((q) => q.id);

    const attempts = quizIds.length
      ? await this.prisma.attempt.findMany({
          where: { studentId, quizId: { in: quizIds } },
        })
      : [];

    const items = activeQuizzes
      .map((quiz) => this.toListItem(quiz, attempts))
      .sort((a, b) => this.sortByWindow(a, b));

    return { items };
  }

  // -------------------------------------------------------------------------
  // GET /api/student/quizzes/:id
  // -------------------------------------------------------------------------

  async getQuizInstructions(
    studentId: string,
    quizId: string,
  ): Promise<StudentQuizInstructionsDto> {
    const quiz = await this.prisma.quiz.findFirst({
      where: {
        id: quizId,
        status: QuizStatus.PUBLISHED,
        students: { some: { userId: studentId } },
      },
      include: { quizQuestions: { select: { questionId: true } } },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found or not available.');
    }

    const now = new Date();
    const inWindow = this.isWithinWindow(quiz, now);

    const attempts = await this.prisma.attempt.findMany({
      where: { studentId, quizId },
    });

    const listItem = this.toListItem(quiz, attempts);
    const latestActiveAttempt = this.findLatestAttempt(attempts);

    return {
      ...listItem,
      canStart: inWindow,
      reasonIfBlocked: inWindow ? null : this.reasonForBlockedWindow(quiz, now),
      ...(latestActiveAttempt
        ? { attemptId: latestActiveAttempt.id }
        : { attemptId: listItem.attemptId }),
    };
  }

  // -------------------------------------------------------------------------
  // POST /api/student/quizzes/:quizId/accept-invitation
  // -------------------------------------------------------------------------

  async acceptQuizInvitation(
    studentId: string,
    quizId: string,
  ): Promise<StudentQuizInvitationResponseDto> {
    const quiz = await this.prisma.quiz.findFirst({
      where: {
        id: quizId,
        status: QuizStatus.PUBLISHED,
      },
      select: { id: true, title: true },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found or not available.');
    }
    const result = await this.prisma.$transaction((tx) =>
      this.invitationService.claimInvitation(tx, studentId, quizId),
  );

    return {
      quizId: quiz.id,
      title: quiz.title,
      ...result,
    };
}

  // -------------------------------------------------------------------------
  // GET /api/student/attempts/active
  // -------------------------------------------------------------------------

  async getActiveAttempt(
    studentId: string,
  ): Promise<StudentActiveAttemptResponseDto> {
    const attempt = await this.prisma.attempt.findFirst({
      where: { studentId, status: AttemptStatus.IN_PROGRESS },
      orderBy: { startedAt: 'desc' },
    });

    if (!attempt) {
      return { attempt: null };
    }

    const refreshed = await this.autoFinalizeIfExpired(attempt);
    if (!refreshed || refreshed.status !== AttemptStatus.IN_PROGRESS) {
      return { attempt: null };
    }

    const dto: StudentActiveAttemptDto = {
      attemptId: refreshed.id,
      quizId: refreshed.quizId,
      startedAt: refreshed.startedAt,
      expiresAt: refreshed.expiresAt,
    };
    return { attempt: dto };
  }

  // -------------------------------------------------------------------------
  // POST /api/student/quizzes/:quizId/start
  // -------------------------------------------------------------------------

  async startAttempt(
    studentId: string,
    quizId: string,
  ): Promise<StudentAttemptResponse> {
    const quiz = await this.prisma.quiz.findFirst({
      where: {
        id: quizId,
        status: QuizStatus.PUBLISHED,
        students: { some: { userId: studentId } },
      },
    });

    if (!quiz || !this.isWithinWindow(quiz, new Date())) {
      throw new NotFoundException('Quiz not found or not available.');
    }

    const existing = await this.prisma.attempt.findFirst({
      where: {
        studentId,
        quizId,
        status: AttemptStatus.IN_PROGRESS,
      },
    });
    if (existing) {
      throw new ConflictException(
        'You already have an active attempt for this quiz.',
      );
    }

    const created = await this.orchestrator.startAttempt(quizId, studentId);
    const durationDeadline = computeExpiresAt(
      created.startedAt,
      quiz.durationMinutes ?? 30,
    );

    const expiresAt =
      quiz.endsAt && quiz.endsAt < durationDeadline
        ? quiz.endsAt
        : durationDeadline;

    await this.prisma.attempt.update({
      where: { id: created.id },
      data: { expiresAt },
    });

    return { ...created, expiresAt, result: null };
  }

  // -------------------------------------------------------------------------
  // GET /api/student/attempts/:attemptId/questions
  // -------------------------------------------------------------------------

  async getAttemptQuestions(
    studentId: string,
    attemptId: string,
  ): Promise<StudentAttemptQuestionsResponseDto> {
    const attempt = await this.findAttemptForStudent(attemptId, studentId);
    const refreshed = await this.autoFinalizeIfExpired(attempt);

    if (refreshed.status !== AttemptStatus.IN_PROGRESS) {
      throw new ConflictException('Attempt is no longer in progress.');
    }

    const questions = (await this.orchestrator.listQuizQuestions(
      refreshed.quizId,
    )) as QuestionRow[];

    const ordered = questions
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(
            (q, idx): StudentAttemptQuestionDto => ({
          id: q.id,
          type: q.type,
          text: q.text,
          options: q.options,
          codeSnippet: (q as any).codeSnippet ?? null,
          codeLanguage: (q as any).codeLanguage ?? null,
          order: idx,
        }),
      );

    return {
      attemptId: refreshed.id,
      quizId: refreshed.quizId,
      expiresAt: refreshed.expiresAt,
      remainingSeconds: remainingSeconds(refreshed.expiresAt),
      questions: ordered,
    };
  }

  // -------------------------------------------------------------------------
  // PATCH /api/student/attempts/:attemptId/answers
  // -------------------------------------------------------------------------

  async saveAttemptAnswers(
    studentId: string,
    attemptId: string,
    items: SaveAnswerItemDto[],
  ): Promise<AttemptAnswerResponseDto[]> {
    const attempt = await this.findAttemptForStudent(attemptId, studentId);
    const refreshed = await this.autoFinalizeIfExpired(attempt);

    if (refreshed.status !== AttemptStatus.IN_PROGRESS) {
      throw new ConflictException(
        `Cannot modify a '${refreshed.status.toLowerCase()}' attempt.`,
      );
    }

    const normalized = await this.normalizeAnswerItems(refreshed.quizId, items);

    return this.orchestrator.saveAnswers(attemptId, studentId, normalized);
  }

  // -------------------------------------------------------------------------
  // POST /api/student/attempts/:attemptId/submit
  // -------------------------------------------------------------------------

  async submitAttempt(
    studentId: string,
    attemptId: string,
    items: SaveAnswerItemDto[],
  ): Promise<StudentAttemptResponse> {
    const attempt = await this.findAttemptForStudent(attemptId, studentId);
    const refreshed = await this.autoFinalizeIfExpired(attempt);

    if (refreshed.status === AttemptStatus.SUBMITTED) {
      throw new ConflictException(
        `Cannot submit a '${refreshed.status.toLowerCase()}' attempt.`,
      );
    }

    if (refreshed.status === AttemptStatus.TIMED_OUT) {
      return this.withAttemptMetadata(
        attemptId,
        await this.orchestrator.getResult(attemptId, studentId),
      );
    }

    let normalizedForSubmit: SaveAnswerItemDto[] = [];
    if (items.length > 0) {
      normalizedForSubmit = await this.normalizeAnswerItems(refreshed.quizId, items);
      await this.orchestrator.saveAnswers(attemptId, studentId, normalizedForSubmit);
    }

    return this.withAttemptMetadata(
      attemptId,
      await this.orchestrator.submit(attemptId, studentId, normalizedForSubmit),
    );
  }

  // -------------------------------------------------------------------------
  // GET /api/student/attempts/:attemptId/result
  // -------------------------------------------------------------------------

  async getOfficialScore(studentId: string, quizId: string) {
    return this.orchestrator.getOfficialScore(quizId, studentId);
  }


  // -------------------------------------------------------------------------
  // GET /api/student/profile
  // -------------------------------------------------------------------------

  async getProfile(studentId: string) {
    const attempts = await this.prisma.attempt.findMany({
      where: {
        studentId,
        status: { in: [AttemptStatus.SUBMITTED, AttemptStatus.TIMED_OUT] },
      },
      include: {
        quiz: { select: { title: true } },
        answers: {
          include: { question: { select: { topic: true, tags: true } } },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    const history = attempts.map((a) => ({
      attemptId: a.id,
      quizId: a.quizId,
      quizTitle: (a as any).quiz?.title ?? 'Quiz',
      score: a.score,
      maxScore: a.maxScore,
      percentage:
        a.score != null && a.maxScore
          ? Math.round((a.score / a.maxScore) * 100 * 100) / 100
          : null,
      submittedAt: a.submittedAt,
    }));

    const topics = new Map<string, { correct: number; total: number }>();
    for (const a of attempts) {
      for (const ans of (a as any).answers ?? []) {
        if (ans.isCorrect == null) continue;
        const keys = new Set<string>([
          ...((ans.question?.tags ?? []) as string[]),
          ...(ans.question?.topic ? [ans.question.topic as string] : []),
        ]);
        for (const key of keys) {
          const entry = topics.get(key) ?? { correct: 0, total: 0 };
          entry.total += 1;
          if (ans.isCorrect) entry.correct += 1;
          topics.set(key, entry);
        }
      }
    }

    const topicSignals = [...topics.entries()]
      .map(([topic, v]) => ({
        topic,
        correct: v.correct,
        total: v.total,
        rate: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return { history, topicSignals };
  }

  
  async getAttemptResult(
    studentId: string,
    attemptId: string,
  ): Promise<StudentAttemptResponse> {
    const attempt = await this.findAttemptForStudent(attemptId, studentId);
    const refreshed = await this.autoFinalizeIfExpired(attempt);

    if (refreshed.status === AttemptStatus.IN_PROGRESS) {
      throw new ConflictException('Attempt has not been submitted yet.');
    }

    return this.withAttemptMetadata(
      attemptId,
      await this.orchestrator.getResult(attemptId, studentId),
    );
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async findAttemptForStudent(
    attemptId: string,
    studentId: string,
  ): Promise<AttemptRow> {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
    });
    if (!attempt) {
      throw new NotFoundException('Attempt not found.');
    }
    if (attempt.studentId !== studentId) {
      throw new ForbiddenException('Access denied.');
    }
    return attempt as AttemptRow;
  }

  private async autoFinalizeIfExpired(
    attempt: AttemptRow,
  ): Promise<AttemptRow> {
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      return attempt;
    }
    if (!isExpired(attempt.expiresAt)) {
      return attempt;
    }
    const updated = await this.prisma.attempt.update({
      where: { id: attempt.id },
      data: {
        status: AttemptStatus.TIMED_OUT,
        submittedAt: new Date(),
      },
    });
    return updated as AttemptRow;
  }

  private async normalizeAnswerItems(
    quizId: string,
    items: SaveAnswerItemDto[],
  ): Promise<SaveAnswerItemDto[]> {
    const ids = Array.from(new Set(items.map((i) => i.questionId)));
    const found = await this.prisma.quizQuestion.findMany({
      where: { quizId, questionId: { in: ids } },
      select: {
        questionId: true,
        question: { select: { type: true } },
      },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException(
        'One or more questionIds do not belong to this quiz.',
      );
    }

    const typeByQuestionId = new Map(
      found.map((q) => [q.questionId, q.question.type]),
    );

    return items.map((item) => {
      const type = typeByQuestionId.get(item.questionId)!;

      if (type === QuestionType.MULTI_SELECT) {
        if (item.textAnswer != null && item.textAnswer !== '') {
          throw new BadRequestException(
            'Multi-select questions must use selectedOptionIds, not textAnswer.',
          );
        }
        if (item.selectedOptionId != null && (item.selectedOptionId as string) !== '') {
          throw new BadRequestException(
            'Multi-select questions must use selectedOptionIds, not selectedOptionId.',
          );
        }
        const ids = (item as any).selectedOptionIds ?? [];
        if (!Array.isArray(ids)) {
          throw new BadRequestException(
            'selectedOptionIds must be an array for MULTI_SELECT.',
          );
        }
        return {
          questionId: item.questionId,
          selectedOptionIds: ids,
          selectedOptionId: null,
          textAnswer: null,
        } as any;
      }

      const isChoiceQuestion =
        type === QuestionType.MCQ || type === QuestionType.TRUE_FALSE;

      if (isChoiceQuestion) {
        if (item.textAnswer != null && item.textAnswer !== '') {
          throw new BadRequestException(
            'Choice questions must use selectedOptionId, not textAnswer.',
          );
        }
        if ((item as any).selectedOptionIds != null) {
          throw new BadRequestException(
            'Choice questions must use selectedOptionId, not selectedOptionIds.',
          );
        }
        return {
          questionId: item.questionId,
          selectedOptionId: item.selectedOptionId ?? null,
          textAnswer: null,
        };
      }

      if (item.selectedOptionId != null && item.selectedOptionId !== '') {
        throw new BadRequestException(
          'Text questions must use textAnswer, not selectedOptionId.',
        );
      }
      if ((item as any).selectedOptionIds != null) {
        throw new BadRequestException(
          'Text questions must use textAnswer, not selectedOptionIds.',
        );
      }

      const textAnswer = item.textAnswer ?? null;
      const normalizedText =
       type === QuestionType.SHORT_TEXT || type === QuestionType.FILL_BLANK || type === QuestionType.CODE_CONTEXT
          ? normalizeShortTextAnswer(textAnswer)
          : textAnswer === null
            ? null
            : textAnswer.trim() === ''
              ? null
              : textAnswer.trim();
      return {
        questionId: item.questionId,
        selectedOptionId: null,
        textAnswer: normalizedText,
      };
    });
  }

  private isWithinWindow(quiz: QuizRow, now: Date): boolean {
    if (quiz.startsAt && quiz.startsAt.getTime() > now.getTime()) {
      return false;
    }
    if (quiz.endsAt && quiz.endsAt.getTime() < now.getTime()) {
      return false;
    }
    return true;
  }

  private reasonForBlockedWindow(quiz: QuizRow, now: Date): string {
       if (quiz.startsAt && quiz.startsAt.getTime() > now.getTime()) {
      return `Quiz opens on ${quiz.startsAt.toUTCString()}. Come back then to start.`;
    }
    if (quiz.endsAt && quiz.endsAt.getTime() < now.getTime()) {
      return 'Quiz window has closed. Your submitted attempts and results are still available in your profile.';
    }
    return 'Quiz is not currently available.';
  }

  private toListItem(
    quiz: QuizRow,
    attempts: AttemptRow[],
  ): StudentQuizListItemDto {
    const quizAttempts = attempts.filter((a) => a.quizId === quiz.id);
    const attemptStatus = deriveAttemptStatus(quizAttempts);
    const latestActive = this.findLatestAttempt(quizAttempts);

    return {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      durationMinutes: quiz.durationMinutes,
      passingScore: quiz.passingScore,
      maxAttempts: quiz.maxAttempts,
      startsAt: quiz.startsAt,
      endsAt: quiz.endsAt,
      questionCount: quiz.quizQuestions?.length ?? 0,
      attemptStatus,
      attemptId: latestActive ? latestActive.id : null,
    };
  }

  private findLatestAttempt(attempts: AttemptRow[]): AttemptRow | null {
    if (attempts.length === 0) return null;
    return attempts.reduce((latest, current) =>
      current.startedAt.getTime() > latest.startedAt.getTime()
        ? current
        : latest,
    );
  }

  private sortByWindow(
    a: StudentQuizListItemDto,
    b: StudentQuizListItemDto,
  ): number {
    const aTime = a.startsAt ? a.startsAt.getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.startsAt ? b.startsAt.getTime() : Number.POSITIVE_INFINITY;
    if (aTime !== bTime) {
      return aTime - bTime;
    }
    return a.id.localeCompare(b.id);
  }

  private async withAttemptMetadata(
    attemptId: string,
    attempt: AttemptResponseDto,
  ): Promise<StudentAttemptResponse> {
    const [attemptRow, resultRow] = await Promise.all([
      this.prisma.attempt.findUnique({
        where: { id: attemptId },
        select: { expiresAt: true },
      }),
      this.prisma.result.findUnique({ where: { attemptId } }),
    ]);
    if (!attemptRow) {
      throw new NotFoundException('Attempt not found.');
    }
    return {
      ...attempt,
      expiresAt: attemptRow.expiresAt,
      result: resultRow
        ? {
            percentage: resultRow.percentage,
            passed: resultRow.passed,
            gradedAt: resultRow.gradedAt,
            gradingStatus: resultRow.gradingStatus,
            pendingEssayCount: resultRow.pendingEssayCount,
          }
        : null,
    };
  }
}
