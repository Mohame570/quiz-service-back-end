import { LIVE_API_BASE_URL, waitForApi } from './helpers/live-client';

const runLiveTests = process.env.LIVE_TESTS === '1';

const ADMIN = { email: 'admin1@example.com', password: 'Password123!' };

type LoginResponse = {
  tokens: { accessToken: string };
};

type GradingQueueResponse = {
  items: Array<{
    attemptId: string;
    quizId: string;
    quizTitle: string;
    studentEmail: string;
    pendingEssayCount: number;
    currentScore: number;
    maxScore: number;
  }>;
};

type GradingAttemptDetail = {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  result: {
    gradingStatus: 'PARTIAL' | 'COMPLETE';
    pendingEssayCount: number;
    passed: boolean | null;
    percentage: number;
  } | null;
  answers: Array<{
    id: string;
    questionType: string;
    pendingManualGrade: boolean;
    pointsEarned: number | null;
    maxPoints: number;
  }>;
};

type AttemptResponse = {
  id: string;
  score: number | null;
  maxScore: number | null;
  answers: Array<{
    id: string;
    pointsEarned: number | null;
    isCorrect: boolean | null;
  }>;
};

async function login(email: string, password: string): Promise<string> {
  const response = await fetch(`${LIVE_API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = (await response.json()) as LoginResponse;
  expect(response.status).toBe(201);
  return body.tokens.accessToken;
}

async function fetchJson<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${LIVE_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json()) as T;
  return { status: response.status, body };
}

(runLiveTests ? describe : describe.skip)(
  'Live server — analytics grading',
  () => {
    beforeAll(async () => {
      await waitForApi();
    }, 90_000);

    it('returns the seeded PARTIAL attempt in the grading queue', async () => {
      const token = await login(ADMIN.email, ADMIN.password);

      const queue = await fetchJson<GradingQueueResponse>(
        token,
        '/admin/analytics/grading/queue?quizId=new-quiz-5',
      );

      expect(queue.status).toBe(200);
      expect(queue.body.items.length).toBeGreaterThanOrEqual(1);

      const partial = queue.body.items.find(
        (item) =>
          item.quizId === 'new-quiz-5' &&
          item.studentEmail === 'student1@example.com' &&
          item.pendingEssayCount === 1,
      );
      expect(partial).toBeDefined();
      expect(partial!.currentScore).toBe(5);
      expect(partial!.maxScore).toBe(6);
    });

    it('grades the pending essay and completes the attempt result', async () => {
      const token = await login(ADMIN.email, ADMIN.password);

      const queue = await fetchJson<GradingQueueResponse>(
        token,
        '/admin/analytics/grading/queue?quizId=new-quiz-5',
      );
      const partial = queue.body.items.find(
        (item) =>
          item.quizId === 'new-quiz-5' &&
          item.studentEmail === 'student1@example.com',
      );
      expect(partial).toBeDefined();

      const attemptId = partial!.attemptId;

      const detailBefore = await fetchJson<GradingAttemptDetail>(
        token,
        `/admin/analytics/grading/attempts/${attemptId}`,
      );
      expect(detailBefore.status).toBe(200);
      expect(detailBefore.body.result?.gradingStatus).toBe('PARTIAL');
      expect(detailBefore.body.result?.pendingEssayCount).toBe(1);
      expect(detailBefore.body.result?.passed).toBeNull();

      const pendingEssay = detailBefore.body.answers.find(
        (answer) => answer.pendingManualGrade,
      );
      expect(pendingEssay).toBeDefined();

      const grade = await fetchJson<AttemptResponse>(
        token,
        `/admin/analytics/grading/attempts/${attemptId}/answers/${pendingEssay!.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ pointsEarned: pendingEssay!.maxPoints }),
        },
      );

      expect(grade.status).toBe(200);
      expect(grade.body.score).toBe(6);
      expect(grade.body.maxScore).toBe(6);

      const gradedAnswer = grade.body.answers.find(
        (answer) => answer.id === pendingEssay!.id,
      );
      expect(gradedAnswer?.pointsEarned).toBe(pendingEssay!.maxPoints);
      expect(gradedAnswer?.isCorrect).toBe(true);

      const detailAfter = await fetchJson<GradingAttemptDetail>(
        token,
        `/admin/analytics/grading/attempts/${attemptId}`,
      );
      expect(detailAfter.status).toBe(200);
      expect(detailAfter.body.result?.gradingStatus).toBe('COMPLETE');
      expect(detailAfter.body.result?.pendingEssayCount).toBe(0);
      expect(detailAfter.body.result?.passed).toBe(true);
      expect(detailAfter.body.result?.percentage).toBe(100);
    });
  },
);
