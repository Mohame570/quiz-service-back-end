import { LIVE_API_BASE_URL } from './helpers/live-client';
import {
  fetchMailhogMessagesFull,
  type MailhogMessage,
} from './helpers/mailhog-extra';
import { waitForApi } from './helpers/live-client';

const runLiveTests = process.env.LIVE_TESTS === '1';
const ADMIN = { email: 'admin1@example.com', password: 'Password123!' };
const ACCEPTED_STUDENT = {
  email: 'student2@example.com',
  password: 'Password123!',
};

type LoginResponse = { tokens: { accessToken: string } };
type QuizResponse = { id: string; title: string; status: string };
type ReminderPreview = { quizId: string; count: number; recipients: string[] };
type ReminderDispatch = {
  quizId: string;
  attempted: number;
  sent: number;
  failed: number;
  results: Array<{ recipientEmail: string; status: string }>;
};

async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<{ status: number; body: T }> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(`${LIVE_API_BASE_URL}${path}`, {
    ...init,
    headers,
  });
  const body = (await response.json().catch(() => ({}))) as T;
  return { status: response.status, body };
}

async function login(credentials: { email: string; password: string }): Promise<string> {
  const result = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });

  expect(result.status).toBe(200);
  return result.body.tokens.accessToken;
}

function reminderMessages(messages: MailhogMessage[], quizTitle: string) {
  return messages.filter((message) =>
    (message.Content.Headers['Subject'] ?? []).some((subject) =>
      subject.includes(`Reminder: ${quizTitle}`),
    ),
  );
}

function recipientAddresses(messages: MailhogMessage[]): string[] {
  return messages.flatMap((message) =>
    (message.Content.Headers['To'] ?? []).flatMap((header) =>
      (header.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []).map(
        (email) => email.toLowerCase(),
      ),
    ),
  );
}

async function waitForReminderMessages(
  quizTitle: string,
  expectedCount: number,
  timeoutMs = 20_000,
): Promise<MailhogMessage[]> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const matching = reminderMessages(await fetchMailhogMessagesFull(), quizTitle);
    if (matching.length >= expectedCount) return matching;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Expected ${expectedCount} reminder emails for "${quizTitle}" in MailHog.`,
  );
}

(runLiveTests ? describe : describe.skip)(
  'Live server - reminder eligibility and MailHog recipients',
  () => {
    let adminToken: string;
    let quizId: string | undefined;

    beforeAll(async () => {
      await waitForApi();
      await fetchMailhogMessagesFull();
    }, 90_000);

    afterAll(async () => {
      if (quizId && adminToken) {
        await apiRequest(`/admin/quizzes/${quizId}`, { method: 'DELETE' }, adminToken);
      }
    });

    it('sends reminders only to the pending recipients returned by preview', async () => {
      adminToken = await login(ADMIN);
      const acceptedStudentToken = await login(ACCEPTED_STUDENT);
      const suffix = Date.now().toString();
      const quizTitle = `Live Reminder Eligibility ${suffix}`;
      const eligibleRecipients = [
        `live-reminder-${suffix}-a@example.com`,
        `live-reminder-${suffix}-b@example.com`,
      ];
      const acceptedRecipient = ACCEPTED_STUDENT.email;

      const createQuiz = await apiRequest<QuizResponse>(
        '/admin/quizzes',
        {
          method: 'POST',
          body: JSON.stringify({
            title: quizTitle,
            description: 'Live reminder recipient verification.',
            status: 'draft',
            durationMinutes: 30,
            passingScore: 50,
            createdById: 'cmqmalcro0000zgud0fnpw5go',
            startsAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          }),
        },
        adminToken,
      );
      expect(createQuiz.status).toBe(201);
      quizId = createQuiz.body.id;

      const createQuestion = await apiRequest<{ id: string }>(
        '/questions',
        {
          method: 'POST',
          body: JSON.stringify({
            quizIds: [quizId],
            type: 'TRUE_FALSE',
            text: `Reminder eligibility question ${suffix}`,
            correctAnswer: 'True',
          }),
        },
        adminToken,
      );
      expect(createQuestion.status).toBe(201);

      const publishQuiz = await apiRequest<QuizResponse>(
        `/admin/quizzes/${quizId}/publish`,
        { method: 'POST' },
        adminToken,
      );
      expect(publishQuiz.status).toBe(200);
      expect(publishQuiz.body.status).toBe('PUBLISHED');

      const createInvitations = await apiRequest(
        '/admin/notifications/send-invitation',
        {
          method: 'POST',
          body: JSON.stringify({
            quizId,
            recipientEmails: [...eligibleRecipients, acceptedRecipient],
          }),
        },
        adminToken,
      );
      expect(createInvitations.status).toBe(201);

      const acceptInvitation = await apiRequest(
        `/student/quizzes/${quizId}/accept-invitation`,
        { method: 'POST' },
        acceptedStudentToken,
      );
      expect(acceptInvitation.status).toBe(201);

      const preview = await apiRequest<ReminderPreview>(
        `/admin/quizzes/${quizId}/reminders/preview`,
        { method: 'GET' },
        adminToken,
      );
      expect(preview.status).toBe(200);
      expect(preview.body.count).toBe(eligibleRecipients.length);
      expect(preview.body.recipients.map((email) => email.toLowerCase()).sort()).toEqual(
        eligibleRecipients.map((email) => email.toLowerCase()).sort(),
      );
      expect(preview.body.recipients).not.toContain(acceptedRecipient);

      const dispatch = await apiRequest<ReminderDispatch>(
        `/admin/quizzes/${quizId}/reminders`,
        { method: 'POST' },
        adminToken,
      );
      expect(dispatch.status).toBe(201);
      expect(dispatch.body.attempted).toBe(preview.body.count);
      expect(dispatch.body.sent).toBe(preview.body.count);
      expect(dispatch.body.failed).toBe(0);
      expect(dispatch.body.results).toHaveLength(preview.body.count);

      const captures = await waitForReminderMessages(
        quizTitle,
        preview.body.count,
      );
      const capturedRecipients = recipientAddresses(captures).sort();
      expect(captures).toHaveLength(preview.body.count);
      expect(capturedRecipients).toEqual(
        preview.body.recipients.map((email) => email.toLowerCase()).sort(),
      );
      expect(capturedRecipients).not.toContain(acceptedRecipient);
    }, 90_000);
  },
);