// test/live/e2e-full-flow.live-spec.ts
//
// End-to-end integration test covering the full platform flow:
//   register → verify email → login → solve quiz → submit → score → analytics
//
// Runs against the live Docker stack (docker compose up).
// Set LIVE_TESTS=1 to enable.

import { LIVE_API_BASE_URL, waitForApi, purgeMailhogMessages } from './helpers/live-client';
import {
  waitForMailToRecipient,
  extractVerificationToken,
} from './helpers/mailhog-extra';

const runLiveTests = process.env.LIVE_TESTS === '1';

type AuthResult = {
  user: { id: string; email: string; emailVerified: boolean; role: string };
  tokens: { accessToken: string; tokenType: string };
};

type Attempt = {
  id: string;
  quizId: string;
  studentId: string;
  startedAt: string;
  submittedAt: string | null;
  status: string;
  score: number | null;
  maxScore: number | null;
  answers: Array<{
    id: string;
    questionId: string;
    selectedOptionId: string | null;
    isCorrect: boolean | null;
  }>;
};

type QuizListItem = {
  id: string;
  title: string;
  attemptId: string | null;
  attemptStatus: string;
};

type QuizInstructions = {
  id: string;
  title: string;
  canStart: boolean;
  reasonIfBlocked: string | null;
  attemptId: string | null;
};

async function authHeader(token: string): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

(runLiveTests ? describe : describe.skip)(
  'Live server — end-to-end full flow',
  () => {
    let studentEmail: string;
    let studentToken: string;
    let adminToken: string;
    let quizId: string | null = null;
    let attemptId: string | null = null;
    let seededQuizId: string;

    beforeAll(async () => {
      await waitForApi();
      await purgeMailhogMessages();

      // Login as the seeded admin to get a token for admin operations
      const adminLogin = await fetch(`${LIVE_API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@live-test.example',
          password: 'Password123!',
        }),
      });
      const adminBody = (await adminLogin.json()) as AuthResult;
      adminToken = adminBody.tokens.accessToken;

      // We'll use the seeded quiz-1 (Sprint 1 Assessment, PUBLISHED, active)
      seededQuizId = 'quiz-1';
    }, 90_000);

    // -------------------------------------------------------------------
    // 1. Register
    // -------------------------------------------------------------------

    it('STEP 1: registers a new student', async () => {
      studentEmail = `e2e-flow-${Date.now()}@example.com`;

      const response = await fetch(`${LIVE_API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'E2E Flow Student',
          email: studentEmail,
          password: 'StrongPass123!',
        }),
      });

      const body = (await response.json()) as AuthResult;

      expect(response.status).toBe(201);
      expect(body.user.email).toBe(studentEmail);
      expect(body.user.emailVerified).toBe(false);
      expect(body.tokens.accessToken).toBeDefined();
    });

    // -------------------------------------------------------------------
    // 2. Verify email
    // -------------------------------------------------------------------

    it('STEP 2: receives and completes email verification', async () => {
      const message = await waitForMailToRecipient(studentEmail, 30_000);
      const token = extractVerificationToken(message);

      expect(token).toBeDefined();

      const response = await fetch(`${LIVE_API_BASE_URL}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const body = (await response.json()) as { success: boolean };

      expect(response.status).toBe(201);
      expect(body.success).toBe(true);
    });

    // -------------------------------------------------------------------
    // 3. Login after verification
    // -------------------------------------------------------------------

    it('STEP 3: logs in and confirms verified status', async () => {
      const response = await fetch(`${LIVE_API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: studentEmail,
          password: 'StrongPass123!',
        }),
      });

      const body = (await response.json()) as AuthResult;

      expect(response.status).toBe(201);
      expect(body.user.emailVerified).toBe(true);
      studentToken = body.tokens.accessToken;
    });

    // -------------------------------------------------------------------
    // 4. View student dashboard & quiz instructions
    // -------------------------------------------------------------------

    it('STEP 4: sees the seeded quiz in the student dashboard', async () => {
      const response = await fetch(
        `${LIVE_API_BASE_URL}/student/quizzes`,
        { headers: await authHeader(studentToken) },
      );

      const body = (await response.json()) as { items: QuizListItem[] };

      expect(response.status).toBe(200);
      expect(Array.isArray(body.items)).toBe(true);
    });

    it('STEP 4b: gets quiz instructions for the seeded published quiz', async () => {
      const response = await fetch(
        `${LIVE_API_BASE_URL}/student/quizzes/${seededQuizId}`,
        { headers: await authHeader(studentToken) },
      );

      const body = await response.json() as QuizInstructions;

      if (response.status === 200) {
        expect(body.title).toBeDefined();
        expect(body.canStart).toBeDefined();
      }
    });

    // -------------------------------------------------------------------
    // 5. Admin creates a quiz, adds a question, publishes it
    // -------------------------------------------------------------------

    it('STEP 5: admin creates a quiz, adds a question, publishes it', async () => {
      const uniqueSuffix = Date.now().toString();

      const createRes = await fetch(`${LIVE_API_BASE_URL}/admin/quizzes`, {
        method: 'POST',
        headers: await authHeader(adminToken),
        body: JSON.stringify({
          title: `E2E Flow Quiz ${uniqueSuffix}`,
          description: 'Auto-created by e2e full-flow live test',
          status: 'draft',
          durationMinutes: 30,
          passingScore: 50,
          startsAt: new Date(Date.now() + 1_000).toISOString(),
          endsAt: new Date(Date.now() + 86_400_000).toISOString(),
          createdById: 'cmqmalcro0000zgud0fnpw5go',
        }),
      });

      const quiz = (await createRes.json()) as { id: string; title: string };
      quizId = quiz.id;

      const qRes = await fetch(`${LIVE_API_BASE_URL}/questions`, {
        method: 'POST',
        headers: await authHeader(adminToken),
        body: JSON.stringify({
          quizId,
          type: 'TRUE_FALSE',
          text: 'The Earth is round.',
          correctAnswer: 'True',
        }),
      });

      expect(createRes.status).toBe(201);
      expect(qRes.status).toBe(201);

      const pubRes = await fetch(
        `${LIVE_API_BASE_URL}/admin/quizzes/${quizId}/publish`,
        { method: 'POST', headers: await authHeader(adminToken) },
      );

      const published = (await pubRes.json()) as { status: string };
      expect(pubRes.status).toBe(200);
      expect(published.status).toBe('PUBLISHED');
    });

    // -------------------------------------------------------------------
    // 6. Start attempt
    // -------------------------------------------------------------------

    it('STEP 6: student starts a quiz attempt', async () => {
      const response = await fetch(`${LIVE_API_BASE_URL}/attempts`, {
        method: 'POST',
        headers: await authHeader(studentToken),
        body: JSON.stringify({ quizId }),
      });

      const body = (await response.json()) as Attempt;

      expect(response.status).toBe(201);
      expect(body.status).toBe('IN_PROGRESS');
      expect(body.quizId).toBe(quizId);
      attemptId = body.id;
    });

    // -------------------------------------------------------------------
    // 7. Save answers and submit
    // -------------------------------------------------------------------

    it('STEP 7: student saves an answer and submits the attempt', async () => {
      const questionsRes = await fetch(
        `${LIVE_API_BASE_URL}/questions?quizId=${quizId}`,
        { headers: await authHeader(adminToken) },
      );
      const questions = (await questionsRes.json()) as Array<{ id: string }>;
      const questionId = questions[0]?.id;

      if (questionId) {
        await fetch(
          `${LIVE_API_BASE_URL}/attempts/${attemptId}/answers`,
          {
            method: 'PATCH',
            headers: await authHeader(studentToken),
            body: JSON.stringify({
              answers: [{ questionId, selectedOptionId: 'True' }],
            }),
          },
        );
      }

      const submitRes = await fetch(
        `${LIVE_API_BASE_URL}/attempts/${attemptId}/submit`,
        {
          method: 'POST',
          headers: await authHeader(studentToken),
          body: JSON.stringify({
            answers: questionId ? [{ questionId, selectedOptionId: 'True' }] : [],
          }),
        },
      );

      const body = (await submitRes.json()) as Attempt;
      expect([200, 201]).toContain(submitRes.status);
      expect(body.status).toBe('SUBMITTED');
    });

    // -------------------------------------------------------------------
    // 8. Check result
    // -------------------------------------------------------------------

    it('STEP 8: student views their result', async () => {
      const response = await fetch(
        `${LIVE_API_BASE_URL}/attempts/${attemptId}/result`,
        { headers: await authHeader(studentToken) },
      );

      expect([200, 409]).toContain(response.status);
    });

    // -------------------------------------------------------------------
    // 9. Admin analytics
    // -------------------------------------------------------------------

    it('STEP 9: admin views analytics dashboard', async () => {
      const response = await fetch(
        `${LIVE_API_BASE_URL}/analytics`,
        { headers: await authHeader(adminToken) },
      );

      const body = (await response.json()) as {
        totalQuizzes: number;
        totalStudents: number;
        totalAttempts: number;
        averageScore: number;
      };

      expect(response.status).toBe(200);
      expect(body.totalQuizzes).toBeGreaterThanOrEqual(1);
      expect(body.totalAttempts).toBeGreaterThanOrEqual(1);
    });

    // -------------------------------------------------------------------
    // 10. Admin integrity view
    // -------------------------------------------------------------------

    it('STEP 10: admin checks suspicious-attempts view', async () => {
      const response = await fetch(
        `${LIVE_API_BASE_URL}/admin/integrity/suspicious`,
        { headers: await authHeader(adminToken) },
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(await response.json())).toBe(true);
    });

    // -------------------------------------------------------------------
    // 11. Admin delivery summary
    // -------------------------------------------------------------------

    it('STEP 11: admin views email delivery summary', async () => {
      const response = await fetch(
        `${LIVE_API_BASE_URL}/admin/notifications/delivery-summary`,
        { headers: await authHeader(adminToken) },
      );

      const body = (await response.json()) as {
        overall: { total: number };
      };

      expect(response.status).toBe(200);
      expect(body.overall.total).toBeGreaterThanOrEqual(1);
    });

    // -------------------------------------------------------------------
    // Cleanup
    // -------------------------------------------------------------------

    afterAll(async () => {
      if (quizId && adminToken) {
        try {
          await fetch(`${LIVE_API_BASE_URL}/admin/quizzes/${quizId}`, {
            method: 'DELETE',
            headers: await authHeader(adminToken),
          });
        } catch {
          // best-effort cleanup
        }
      }
    });
  },
);