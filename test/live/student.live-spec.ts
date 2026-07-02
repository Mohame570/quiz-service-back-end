import { LIVE_API_BASE_URL, waitForApi } from './helpers/live-client';

const runLiveTests = process.env.LIVE_TESTS === '1';

// ---------------------------------------------------------------------------
// Response shapes (kept narrow to what the tests actually assert)
// ---------------------------------------------------------------------------

type LoginResponse = {
  user: { id: string; email: string; role: string; emailVerified: boolean };
  tokens: { accessToken: string; tokenType: 'Bearer'; expiresIn: string };
};

type StudentQuizListItem = {
  id: string;
  title: string;
  durationMinutes: number | null;
  attemptStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'TIMED_OUT';
  attemptId: string | null;
  canStart?: boolean;
};

type StudentQuizListResponse = { items: StudentQuizListItem[] };

type StudentAttemptResponse = {
  id: string;
  quizId: string;
  studentId: string;
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'TIMED_OUT' | 'ABANDONED';
  score: number | null;
  maxScore: number | null;
  result: { percentage: number; passed: boolean; gradedAt: string } | null;
};

type StudentActiveAttemptResponse = {
  attempt: {
    attemptId: string;
    quizId: string;
    startedAt: string;
    expiresAt: string;
  } | null;
};

type StudentAttemptQuestion = {
  id: string;
  type: 'MCQ' | 'TRUE_FALSE' | 'SHORT_TEXT' | 'ESSAY';
  text: string;
  options: string[];
  order: number;
  correctAnswer?: string;
};

type StudentQuestionsResponse = {
  attemptId: string;
  quizId: string;
  expiresAt: string;
  remainingSeconds: number;
  questions: StudentAttemptQuestion[];
};

type StudentAnswerResponse = {
  id: string;
  attemptId: string;
  questionId: string;
  selectedOptionId: string | null;
  textAnswer: string | null;
  isCorrect: boolean | null;
  answeredAt: string;
};

type StudentQuizInvitationResponse = {
  quizId: string;
  title: string;
  assigned: boolean;
  alreadyAssigned: boolean;
};

type NestError = { statusCode: number; message: string | string[]; error: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function login(email: string, password: string): Promise<string> {
  const response = await fetch(`${LIVE_API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (response.status !== 201) {
    throw new Error(`Login failed for ${email}: HTTP ${response.status}`);
  }
  const body = (await response.json()) as LoginResponse;
  return body.tokens.accessToken;
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function jsonRequest<T>(
  token: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${LIVE_API_BASE_URL}${path}`, {
    method,
    headers: authHeaders(token),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const parsed = (await response.json().catch(() => ({}))) as T;
  return { status: response.status, body: parsed };
}

const STUDENT_1 = { email: 'student1@example.com', password: 'Password123!' };
const STUDENT_2 = { email: 'student2@example.com', password: 'Password123!' };

// Shared between the timeout tests so the second test can re-read the
// attempt that the first test auto-finalised.
let timedOutAttemptId: string | null = null;

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

(runLiveTests ? describe : describe.skip)('Live server — student APIs', () => {
  beforeAll(async () => {
    await waitForApi();
  }, 90_000);

  // -------------------------------------------------------------------------
  // Group 1 — auth + list + get-by-id
  // -------------------------------------------------------------------------

  it('logs in as the seeded verified student', async () => {
    const response = await fetch(`${LIVE_API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: STUDENT_1.email, password: STUDENT_1.password }),
    });
    const body = (await response.json()) as LoginResponse;

    expect(response.status).toBe(201);
    expect(body.user.email).toBe(STUDENT_1.email);
    expect(body.user.emailVerified).toBe(true);
    expect(body.tokens.accessToken).toBeDefined();
  });

  it('lists the 5 new quizzes with NOT_STARTED status', async () => {
    const token = await login(STUDENT_1.email, STUDENT_1.password);
    const { status, body } = await jsonRequest<StudentQuizListResponse>(
      token,
      'GET',
      '/student/quizzes',
    );

    expect(status).toBe(200);
    const newQuizIds = body.items
      .map((q) => q.id)
      .filter((id) => id.startsWith('new-quiz-'));
    expect(newQuizIds.sort()).toEqual([
      'new-quiz-1',
      'new-quiz-2',
      'new-quiz-3',
      'new-quiz-4',
      'new-quiz-5',
    ]);
    for (const item of body.items.filter((q) => q.id.startsWith('new-quiz-'))) {
      expect(item.attemptStatus).toBe('NOT_STARTED');
      expect(item.attemptId).toBeNull();
    }
    const newQuiz2 = body.items.find((q) => q.id === 'new-quiz-2');
    expect(newQuiz2?.durationMinutes).toBe(1);
  });

  it('accepts a quiz invitation and adds the student to the roster', async () => {
    const token = await login(STUDENT_2.email, STUDENT_2.password);

    const accept = await jsonRequest<StudentQuizInvitationResponse>(
      token,
      'POST',
      '/student/quizzes/quiz-2/accept-invitation',
    );
    expect(accept.status).toBe(201);
    expect(accept.body.quizId).toBe('quiz-2');
    expect(accept.body.assigned).toBe(true);
    expect(accept.body.alreadyAssigned).toBe(false);

    const acceptAgain = await jsonRequest<StudentQuizInvitationResponse>(
      token,
      'POST',
      '/student/quizzes/quiz-2/accept-invitation',
    );
    expect(acceptAgain.status).toBe(201);
    expect(acceptAgain.body.assigned).toBe(false);
    expect(acceptAgain.body.alreadyAssigned).toBe(true);

    const instructions = await jsonRequest<
      StudentQuizListItem & { questionCount: number; canStart: boolean }
    >(token, 'GET', '/student/quizzes/quiz-2');
    expect(instructions.status).toBe(200);
    expect(instructions.body.id).toBe('quiz-2');
  });

  it('returns quiz instructions for new-quiz-1', async () => {
    const token = await login(STUDENT_1.email, STUDENT_1.password);
    const { status, body } = await jsonRequest<
      StudentQuizListItem & { questionCount: number; canStart: boolean; reasonIfBlocked: string | null }
    >(token, 'GET', '/student/quizzes/new-quiz-1');

    expect(status).toBe(200);
    expect(body.id).toBe('new-quiz-1');
    expect(body.title).toBe('JavaScript Fundamentals');
    expect(body.questionCount).toBe(4);
    expect(body.canStart).toBe(true);
  });

  it('returns 200 for the legacy quiz-1 (regression: cuid ids on existing seeded data)', async () => {
    const token = await login(STUDENT_1.email, STUDENT_1.password);
    const { status, body } = await jsonRequest<StudentQuizListItem & { questionCount: number }>(
      token,
      'GET',
      '/student/quizzes/quiz-1',
    );

    expect(status).toBe(200);
    expect((body as StudentQuizListItem).id).toBe('quiz-1');
  });

  it('returns 404 for an unknown / unassigned quiz id', async () => {
    const token = await login(STUDENT_1.email, STUDENT_1.password);
    const { status } = await jsonRequest<NestError>(
      token,
      'GET',
      '/student/quizzes/this-quiz-does-not-exist',
    );

    expect(status).toBe(404);
  });

  it('accepts cuid-shaped ids on :quizId (regression guard for ParseUUIDPipe removal)', async () => {
    const token = await login(STUDENT_1.email, STUDENT_1.password);
    // cuids (e.g. "cm1...") used to fail with 400 "Validation failed (uuid is expected)";
    // they must now pass validation and reach the service, which returns 404 for unknown ids.
    const { status } = await jsonRequest<NestError>(
      token,
      'GET',
      '/student/quizzes/cm1nonexistentcuidxxxxxxxxxx',
    );

    expect(status).not.toBe(400);
    expect(status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // Group 2 — full solve flow on new-quiz-4 (5 questions, 30 min)
  // -------------------------------------------------------------------------

  it('completes the full start → questions → save → submit → result flow on new-quiz-4', async () => {
    const token = await login(STUDENT_1.email, STUDENT_1.password);

    // 1) Start
    const start = await jsonRequest<StudentAttemptResponse>(
      token,
      'POST',
      '/student/quizzes/new-quiz-4/start',
    );
    expect(start.status).toBe(201);
    expect(start.body.status).toBe('IN_PROGRESS');
    expect(start.body.quizId).toBe('new-quiz-4');
    expect(start.body.score).toBeNull();
    expect(start.body.maxScore).toBeNull();
    expect(start.body.result).toBeNull();
    expect(new Date(start.body.expiresAt).getTime()).toBeGreaterThan(
      new Date(start.body.startedAt).getTime(),
    );
    const attemptId = start.body.id;

    // 2) Active attempt endpoint sees the new attempt
    const active = await jsonRequest<StudentActiveAttemptResponse>(
      token,
      'GET',
      '/student/attempts/active',
    );
    expect(active.status).toBe(200);
    expect(active.body.attempt?.attemptId).toBe(attemptId);

    // 3) Load questions
    const questions = await jsonRequest<StudentQuestionsResponse>(
      token,
      'GET',
      `/student/attempts/${attemptId}/questions`,
    );
    expect(questions.status).toBe(200);
    expect(questions.body.questions).toHaveLength(5);
    for (const q of questions.body.questions) {
      expect(q).not.toHaveProperty('correctAnswer');
    }

    // 4) Save 4 correct answers + 1 wrong (SHORT_TEXT CSS answer is wrong on purpose)
    const answerPayload = questions.body.questions.map((q) => {
      let selectedOptionId: string | null = null;
      let textAnswer: string | undefined;
      switch (q.text) {
        case 'What does HTTP stand for?':
          selectedOptionId = 'HyperText Transfer Protocol';
          break;
        case 'Which HTTP status code indicates a resource was created?':
          selectedOptionId = '201';
          break;
        case 'Which header is typically used to send a JWT in a request?':
          selectedOptionId = 'Authorization';
          break;
        case 'CORS stands for Cross-Origin Resource Sharing.':
          selectedOptionId = 'True';
          break;
        case 'Which CSS property changes the text color of an element?':
          textAnswer = 'Yellow';
          break;
        default:
          selectedOptionId = null;
      }
      return {
        questionId: q.id,
        selectedOptionId,
        ...(textAnswer !== undefined ? { textAnswer } : {}),
      };
    });
    const save = await jsonRequest<StudentAnswerResponse[]>(
      token,
      'PATCH',
      `/student/attempts/${attemptId}/answers`,
      { answers: answerPayload },
    );
    expect(save.status).toBe(200);
    expect(save.body).toHaveLength(5);

    // 5) Submit — ScoringService runs inside AttemptsService.submit
    const submit = await jsonRequest<StudentAttemptResponse>(
      token,
      'POST',
      `/student/attempts/${attemptId}/submit`,
      { answers: [] },
    );
    expect(submit.status).toBe(201);
    expect(submit.body.status).toBe('SUBMITTED');
    expect(submit.body.score).toBe(4);
    expect(submit.body.maxScore).toBe(5);
    expect(submit.body.result).not.toBeNull();
    expect(submit.body.result?.percentage).toBe(80);
    expect(submit.body.result?.passed).toBe(true);
    expect(submit.body.result?.gradedAt).toEqual(expect.any(String));

    // 6) Read result — same shape, no extra writes
    const result = await jsonRequest<StudentAttemptResponse>(
      token,
      'GET',
      `/student/attempts/${attemptId}/result`,
    );
    expect(result.status).toBe(200);
    expect(result.body.status).toBe('SUBMITTED');
    expect(result.body.score).toBe(4);
    expect(result.body.maxScore).toBe(5);
    expect(result.body.result?.percentage).toBe(80);
  });

  it('returns 409 on a second submit of the same attempt', async () => {
    const token = await login(STUDENT_1.email, STUDENT_1.password);

    // Get the SUBMITTED attempt for new-quiz-4 from the previous test.
    // We list quizzes and pick the SUBMITTED one for new-quiz-4.
    const list = await jsonRequest<StudentQuizListResponse>(
      token,
      'GET',
      '/student/quizzes',
    );
    const item = list.body.items.find(
      (q) => q.id === 'new-quiz-4' && q.attemptStatus === 'SUBMITTED',
    );
    expect(item).toBeDefined();
    const attemptId = item!.attemptId!;

    const second = await jsonRequest<NestError>(
      token,
      'POST',
      `/student/attempts/${attemptId}/submit`,
      { answers: [] },
    );

    expect(second.status).toBe(409);
  });

  it('returns 409 when saving answers after submit', async () => {
    const token = await login(STUDENT_1.email, STUDENT_1.password);
    const list = await jsonRequest<StudentQuizListResponse>(
      token,
      'GET',
      '/student/quizzes',
    );
    const item = list.body.items.find(
      (q) => q.id === 'new-quiz-4' && q.attemptStatus === 'SUBMITTED',
    );
    expect(item).toBeDefined();
    const attemptId = item!.attemptId!;

    const save = await jsonRequest<NestError>(
      token,
      'PATCH',
      `/student/attempts/${attemptId}/answers`,
      { answers: [{ questionId: 'irrelevant', selectedOptionId: 'x' }] },
    );

    expect(save.status).toBe(409);
  });

  it('returns 409 when starting a second attempt for a quiz that already has an attempt', async () => {
    // Option A: server-side rejection. We test this by trying to start new-quiz-3
    // (which has no attempts yet) twice in a row. The second start must 409.
    const token = await login(STUDENT_1.email, STUDENT_1.password);

    const first = await jsonRequest<StudentAttemptResponse>(
      token,
      'POST',
      '/student/quizzes/new-quiz-3/start',
    );
    expect(first.status).toBe(201);

    const second = await jsonRequest<NestError>(
      token,
      'POST',
      '/student/quizzes/new-quiz-3/start',
    );

    expect(second.status).toBe(409);
  });

  // -------------------------------------------------------------------------
  // Group 3 — timeout on new-quiz-2 (1-min duration)
  // -------------------------------------------------------------------------

  it('auto-finalises an attempt whose 1-min timer has elapsed', async () => {
    const token2 = await login(STUDENT_2.email, STUDENT_2.password);
    const start = await jsonRequest<StudentAttemptResponse>(
      token2,
      'POST',
      '/student/quizzes/new-quiz-2/start',
    );
    expect(start.status).toBe(201);
    expect(start.body.status).toBe('IN_PROGRESS');
    const expiresAt = new Date(start.body.expiresAt).getTime();
    const nowAtStart = Date.now();
    expect(expiresAt - nowAtStart).toBeGreaterThan(55_000);
    expect(expiresAt - nowAtStart).toBeLessThan(65_000);

    timedOutAttemptId = start.body.id;

    // Wait for the timer to elapse + small grace.
    const waitMs = Math.max(0, expiresAt - Date.now()) + 3_000;
    await sleep(waitMs);

    const questions = await jsonRequest<NestError>(
      token2,
      'GET',
      `/student/attempts/${timedOutAttemptId}/questions`,
    );

    expect(questions.status).toBe(409);
    expect(JSON.stringify(questions.body.message)).toMatch(
      /no longer in progress/i,
    );
  });

  it('exposes the auto-finalised attempt as a TIMED_OUT result with result: null', async () => {
    expect(timedOutAttemptId).not.toBeNull();
    const token2 = await login(STUDENT_2.email, STUDENT_2.password);

    // The active endpoint should no longer return the timed-out attempt.
    const active = await jsonRequest<StudentActiveAttemptResponse>(
      token2,
      'GET',
      '/student/attempts/active',
    );
    expect(active.status).toBe(200);
    expect(active.body.attempt).toBeNull();

    // Reading the result of the timed-out attempt is still allowed
    // (Task 4 acceptance: "Results remain accessible after timeout").
    const result = await jsonRequest<StudentAttemptResponse>(
      token2,
      'GET',
      `/student/attempts/${timedOutAttemptId}/result`,
    );
    expect(result.status).toBe(200);
    expect(result.body.status).toBe('TIMED_OUT');
    expect(result.body.result).toBeNull();
    expect(result.body.score).toBeNull();
    expect(result.body.maxScore).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Group 4 — cross-student isolation
  // -------------------------------------------------------------------------

  it('denies student2 access to student1\'s attempt', async () => {
    const student1Token = await login(STUDENT_1.email, STUDENT_1.password);
    const student2Token = await login(STUDENT_2.email, STUDENT_2.password);

    // student1 still has a SUBMITTED attempt for new-quiz-4 from the earlier test.
    const list = await jsonRequest<StudentQuizListResponse>(
      student1Token,
      'GET',
      '/student/quizzes',
    );
    const student1AttemptId = list.body.items.find(
      (q) => q.id === 'new-quiz-4' && q.attemptStatus === 'SUBMITTED',
    )?.attemptId;
    expect(student1AttemptId).toBeDefined();

    // student2 tries to read student1's attempt.
    const attempt = await jsonRequest<NestError>(
      student2Token,
      'GET',
      `/student/attempts/${student1AttemptId}/questions`,
    );
    expect(attempt.status).toBe(403);

    const result = await jsonRequest<NestError>(
      student2Token,
      'GET',
      `/student/attempts/${student1AttemptId}/result`,
    );
    expect(result.status).toBe(403);
  });
});
