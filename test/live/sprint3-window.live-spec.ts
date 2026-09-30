import { LIVE_API_BASE_URL, waitForApi } from './helpers/live-client';
import {
  extractVerificationToken,
  fetchMailhogMessagesFull,
  type MailhogMessage,
} from './helpers/mailhog-extra';

const runLiveTests = process.env.LIVE_TESTS === '1';

 type AuthResult = {
  tokens: { accessToken: string };
};

type CreatedQuiz = {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
};

type Attempt = {
  id: string;
  quizId: string;
  status: string;
};

type ActiveAttemptResponse = {
  attempt: {
    attemptId: string;
    quizId: string;
    expiresAt: string;
  } | null;
};

type CreatedQuestion = { id: string };

type PreparedQuiz = {
  quizId: string;
  title: string;
  questionId: string;
  studentToken: string;
  endsAt: string;
};

async function jsonRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${LIVE_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  return {
    status: response.status,
    body: (await response.json().catch(() => ({}))) as T,
  };
}

async function login(email: string, password = 'Password123!'): Promise<string> {
  const result = await jsonRequest<AuthResult>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (result.status !== 201) {
    throw new Error(`Login failed for ${email}: HTTP ${result.status}`);
  }

  return result.body.tokens.accessToken;
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForVerificationMail(
  recipientEmail: string,
  timeoutMs = 20_000,
): Promise<MailhogMessage> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const messages = await fetchMailhogMessagesFull();
    const match = messages.find((message) => {
      const sentToRecipient = (message.Content.Headers['To'] ?? []).some((to) =>
        to.toLowerCase().includes(recipientEmail.toLowerCase()),
      );
      return sentToRecipient && /verify-email\?token=/.test(message.Content.Body);
    });

    if (match) return match;
    await sleep(1_000);
  }

  throw new Error(`No verification email for ${recipientEmail} appeared in MailHog.`);
}

async function waitForInvitationMail(
  recipientEmail: string,
  quizTitle: string,
  timeoutMs = 20_000,
): Promise<MailhogMessage> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const messages = await fetchMailhogMessagesFull();
    const match = messages.find((message) => {
      const sentToRecipient = (message.Content.Headers['To'] ?? []).some((to) =>
        to.toLowerCase().includes(recipientEmail.toLowerCase()),
      );
      const subject = (message.Content.Headers['Subject'] ?? []).join(' ');
      const body = message.Content.Body;

      return (
        sentToRecipient &&
        subject.includes(`Quiz invitation: ${quizTitle}`) &&
        body.includes('Open quiz invitation')
      );
    });

    if (match) return match;
    await sleep(1_000);
  }

  throw new Error(
    `No invitation email for ${recipientEmail} and quiz ${quizTitle} appeared in MailHog.`,
  );
}

(runLiveTests ? describe : describe.skip)('Live server - Sprint 3 active window', () => {
  const createdQuizIds: string[] = [];

  beforeAll(async () => {
    await waitForApi();
  }, 90_000);

  afterAll(async () => {
    await Promise.all(
      createdQuizIds.map((quizId) =>
        fetch(`${LIVE_API_BASE_URL}/admin/quizzes/${quizId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
  });

  async function prepareQuiz(
    label: string,
    startsAt: string,
    endsAt: string,
    recipientEmail = 'student2@example.com',
    acceptInvitation = true,
  ): Promise<PreparedQuiz> {
    const adminToken = await login('admin1@example.com');
    const studentToken = acceptInvitation ? await login(recipientEmail) : '';
    const uniqueSuffix = Date.now().toString();
    const title = `Sprint 3 ${label} ${uniqueSuffix}`;

    const createQuiz = await jsonRequest<CreatedQuiz>('/admin/quizzes', {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({
        title,
        description: `Live ${label.toLowerCase()} window enforcement test.`,
        status: 'draft',
        durationMinutes: 30,
        passingScore: 50,
        startsAt,
        endsAt,
        createdById: 'cmqmalcro0000zgud0fnpw5go',
      }),
    });

    expect(createQuiz.status).toBe(201);
    const quizId = createQuiz.body.id;
    createdQuizIds.push(quizId);

    const createQuestion = await jsonRequest<CreatedQuestion>('/questions', {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({
        quizIds: [quizId],
        type: 'TRUE_FALSE',
        text: `The ${label.toLowerCase()} window test question is true.`,
        correctAnswer: 'True',
      }),
    });

    expect(createQuestion.status).toBe(201);

    const publishQuiz = await jsonRequest(`/admin/quizzes/${quizId}/publish`, {
      method: 'POST',
      headers: authHeaders(adminToken),
    });

    expect(publishQuiz.status).toBe(200);

    const sendInvitation = await jsonRequest('/admin/notifications/send-invitation', {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({
        quizId,
        recipientEmails: [recipientEmail],
        invitationUrl: 'http://localhost:3000',
      }),
    });

    expect(sendInvitation.status).toBe(201);

    if (acceptInvitation) {
      const accepted = await jsonRequest(
        `/student/quizzes/${quizId}/accept-invitation`,
        {
          method: 'POST',
          headers: authHeaders(studentToken),
        },
      );

      expect(accepted.status).toBe(201);
    }

    return {
      quizId,
      title,
      questionId: createQuestion.body.id,
      studentToken,
      endsAt,
    };
  }

  it('allows an assigned student to start during an active window', async () => {
    const adminToken = await login('admin1@example.com');
    const studentToken = await login('student2@example.com');
    const uniqueSuffix = Date.now().toString();
    const startsAt = new Date(Date.now() - 60_000).toISOString();
    const endsAt = new Date(Date.now() + 10 * 60_000).toISOString();

    const createQuiz = await jsonRequest<CreatedQuiz>('/admin/quizzes', {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({
        title: `Sprint 3 Active Window ${uniqueSuffix}`,
        description: 'Live active-window enforcement test.',
        status: 'draft',
        durationMinutes: 30,
        passingScore: 50,
        startsAt,
        endsAt,
        createdById: 'cmqmalcro0000zgud0fnpw5go',
      }),
    });

    expect(createQuiz.status).toBe(201);
    const createdQuizId = createQuiz.body.id;
    createdQuizIds.push(createdQuizId);

    const createQuestion = await jsonRequest('/questions', {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({
        quizIds: [createdQuizId],
        type: 'TRUE_FALSE',
        text: 'The active-window live test question is true.',
        correctAnswer: 'True',
      }),
    });

    expect(createQuestion.status).toBe(201);

    const publishQuiz = await jsonRequest('/admin/quizzes/' + createdQuizId + '/publish', {
      method: 'POST',
      headers: authHeaders(adminToken),
    });

    expect(publishQuiz.status).toBe(200);
    expect((publishQuiz.body as CreatedQuiz).status).toBe('PUBLISHED');

    const sendInvitation = await jsonRequest('/admin/notifications/send-invitation', {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({
        quizId: createdQuizId,
        recipientEmails: ['student2@example.com'],
        invitationUrl: 'http://localhost:3000',
      }),
    });

    expect(sendInvitation.status).toBe(201);

    const acceptInvitation = await jsonRequest(
      `/student/quizzes/${createdQuizId}/accept-invitation`,
      {
        method: 'POST',
        headers: authHeaders(studentToken),
      },
    );

    expect(acceptInvitation.status).toBe(201);
    expect((acceptInvitation.body as { assigned: boolean }).assigned).toBe(true);

    const startAttempt = await jsonRequest<Attempt>('/attempts', {
      method: 'POST',
      headers: authHeaders(studentToken),
      body: JSON.stringify({ quizId: createdQuizId }),
    });

    expect(startAttempt.status).toBe(201);
    expect(startAttempt.body.quizId).toBe(createdQuizId);
    expect(startAttempt.body.status).toBe('IN_PROGRESS');

    const activeAttempt = await jsonRequest<ActiveAttemptResponse>(
      '/student/attempts/active',
      {
        method: 'GET',
        headers: authHeaders(studentToken),
      },
    );

    expect(activeAttempt.status).toBe(200);
    expect(activeAttempt.body.attempt?.attemptId).toBe(startAttempt.body.id);
    expect(new Date(activeAttempt.body.attempt?.expiresAt ?? '').getTime()).toBeLessThanOrEqual(
      new Date(endsAt).getTime(),
    );
  });

  it('rejects a start before the assessment opens', async () => {
    const startsAt = new Date(Date.now() + 60_000).toISOString();
    const endsAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const prepared = await prepareQuiz('Early Window', startsAt, endsAt);

    const startAttempt = await jsonRequest('/attempts', {
      method: 'POST',
      headers: authHeaders(prepared.studentToken),
      body: JSON.stringify({ quizId: prepared.quizId }),
    });

    expect(startAttempt.status).toBe(409);
    expect((startAttempt.body as { message: string }).message).toContain(
      'Quiz has not opened yet',
    );

    const attempts = await jsonRequest<unknown[]>(
      `/attempts?quizId=${prepared.quizId}`,
      { method: 'GET', headers: authHeaders(prepared.studentToken) },
    );
    expect(attempts.status).toBe(200);
    expect(attempts.body).toEqual([]);
  });

  it('rejects a start after the assessment closes', async () => {
    const startsAt = new Date(Date.now() - 10 * 60_000).toISOString();
    const endsAt = new Date(Date.now() - 60_000).toISOString();
    const prepared = await prepareQuiz('Late Window', startsAt, endsAt);

    const startAttempt = await jsonRequest('/attempts', {
      method: 'POST',
      headers: authHeaders(prepared.studentToken),
      body: JSON.stringify({ quizId: prepared.quizId }),
    });

    expect(startAttempt.status).toBe(409);
    expect((startAttempt.body as { message: string }).message).toBe(
      'Quiz window has closed',
    );
  });

  it('cuts off an active attempt when the assessment window closes', async () => {
    const startsAt = new Date(Date.now() - 60_000).toISOString();
    const endsAt = new Date(Date.now() + 2_000).toISOString();
    const prepared = await prepareQuiz('Mid Attempt Cutoff', startsAt, endsAt);

    const startAttempt = await jsonRequest<Attempt>('/attempts', {
      method: 'POST',
      headers: authHeaders(prepared.studentToken),
      body: JSON.stringify({ quizId: prepared.quizId }),
    });

    expect(startAttempt.status).toBe(201);

    await sleep(3_000);

    const saveAnswers = await jsonRequest(
      `/attempts/${startAttempt.body.id}/answers`,
      {
        method: 'PATCH',
        headers: authHeaders(prepared.studentToken),
        body: JSON.stringify({
          answers: [
            { questionId: prepared.questionId, selectedOptionId: 'True' },
          ],
        }),
      },
    );

    expect(saveAnswers.status).toBe(409);
    expect((saveAnswers.body as { message: string }).message).toContain(
      'quiz window has closed',
    );

    const attempt = await jsonRequest<{ status: string }>(
      `/attempts/${startAttempt.body.id}`,
      { method: 'GET', headers: authHeaders(prepared.studentToken) },
    );
    expect(attempt.status).toBe(200);
    expect(attempt.body.status).toBe('TIMED_OUT');
  });

  it('links an invitation sent before registration after email verification', async () => {
    const email = `sprint3-invite-${Date.now()}@example.com`;
    const startsAt = new Date(Date.now() - 60_000).toISOString();
    const endsAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const prepared = await prepareQuiz(
      'Pre-registration Invite',
      startsAt,
      endsAt,
      email,
      false,
    );

    const invitationMail = await waitForInvitationMail(
      email,
      prepared.title,
    );
    expect(invitationMail.Content.Body).toContain('Open quiz invitation');

    const register = await jsonRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Sprint 3 Invited Student',
        email,
        password: 'StrongPass123!',
      }),
    });
    expect(register.status).toBe(201);

    const verificationMail = await waitForVerificationMail(email);
    const verificationToken = extractVerificationToken(verificationMail);

    const verify = await jsonRequest('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: verificationToken }),
    });
    expect(verify.status).toBe(201);
    expect((verify.body as { success: boolean }).success).toBe(true);

    const studentToken = await login(email, 'StrongPass123!');
    const quizzes = await jsonRequest<{ items: Array<{ id: string }> }>(
      '/student/quizzes',
      { method: 'GET', headers: authHeaders(studentToken) },
    );

    expect(quizzes.status).toBe(200);
    expect(quizzes.body.items.some((quiz) => quiz.id === prepared.quizId)).toBe(
      true,
    );
  });

  it('blocks an uninvited student from accepting or starting a quiz', async () => {
    const startsAt = new Date(Date.now() - 60_000).toISOString();
    const endsAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const prepared = await prepareQuiz(
      'Uninvited Access',
      startsAt,
      endsAt,
      'student2@example.com',
      false,
    );
    const uninvitedToken = await login('student1@example.com');

    const accept = await jsonRequest(
      `/student/quizzes/${prepared.quizId}/accept-invitation`,
      {
        method: 'POST',
        headers: authHeaders(uninvitedToken),
      },
    );
    expect(accept.status).toBe(403);

    const directStart = await jsonRequest('/attempts', {
      method: 'POST',
      headers: authHeaders(uninvitedToken),
      body: JSON.stringify({ quizId: prepared.quizId }),
    });
    expect(directStart.status).toBe(403);
    expect((directStart.body as { message: string }).message).toContain(
      'not assigned',
    );

    const studentStart = await jsonRequest(
      `/student/quizzes/${prepared.quizId}/start`,
      {
        method: 'POST',
        headers: authHeaders(uninvitedToken),
      },
    );
    expect(studentStart.status).toBe(404);
  });
});
