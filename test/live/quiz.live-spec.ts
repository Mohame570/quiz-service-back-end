import {
  LIVE_API_BASE_URL,
  waitForApi,
} from './helpers/live-client';

const runLiveTests = process.env.LIVE_TESTS === '1';

type CreatedQuiz = {
  id: string;
  title: string;
  description: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  durationMinutes: number | null;
  passingScore: number | null;
  startsAt: string | null;
  endsAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

async function fetchJson<T>(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${LIVE_API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const body = (await response.json()) as T;

  return { status: response.status, body };
}

async function deleteQuizIfPresent(id: string | null): Promise<void> {
  if (!id) {
    return;
  }

  try {
    await fetch(`${LIVE_API_BASE_URL}/admin/quizzes/${id}`, {
      method: 'DELETE',
    });
  } catch {
    // Best-effort cleanup only.
  }
}

(runLiveTests ? describe : describe.skip)(
  'Live server - quiz admin APIs',
  () => {
    beforeAll(async () => {
      await waitForApi();
    }, 90_000);

    it('health endpoint responds from the running stack', async () => {
      const response = await fetch(`${LIVE_API_BASE_URL}/health`);
      const body = (await response.json()) as { status: string };

      expect(response.status).toBe(200);
      expect(body.status).toBe('ok');
    });

    it('supports the full quiz lifecycle over the live API', async () => {
      const uniqueSuffix = Date.now().toString();
      const quizTitle = `Live Quiz ${uniqueSuffix}`;
      const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const endsAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      let createdQuizId: string | null = null;

      try {
        const createResult = await fetchJson<CreatedQuiz>('/admin/quizzes', {
          method: 'POST',
          body: JSON.stringify({
            title: quizTitle,
            description: 'Created by the live quiz test',
            status: 'draft',
            durationMinutes: 30,
            passingScore: 70,
            startsAt,
            endsAt,
          }),
        });

        expect(createResult.status).toBe(201);
        expect(createResult.body.title).toBe(quizTitle);
        expect(createResult.body.status).toBe('DRAFT');
        expect(createResult.body.description).toBe(
          'Created by the live quiz test',
        );
        expect(createResult.body.durationMinutes).toBe(30);
        expect(createResult.body.passingScore).toBe(70);
        expect(createResult.body.startsAt).toBe(startsAt);
        expect(createResult.body.endsAt).toBe(endsAt);
        createdQuizId = createResult.body.id;

        const getResult = await fetchJson<CreatedQuiz>(
          `/admin/quizzes/${createdQuizId}`,
        );

        expect(getResult.status).toBe(200);
        expect(getResult.body.id).toBe(createdQuizId);
        expect(getResult.body.title).toBe(quizTitle);

        const updateTitle = `${quizTitle} Updated`;
        const updateResult = await fetchJson<CreatedQuiz>(
          `/admin/quizzes/${createdQuizId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              title: updateTitle,
              description: 'Updated in the live test',
            }),
          },
        );

        expect(updateResult.status).toBe(200);
        expect(updateResult.body.title).toBe(updateTitle);
        expect(updateResult.body.description).toBe('Updated in the live test');
        expect(updateResult.body.status).toBe('DRAFT');

        const questionResult = await fetchJson<{
          id: string;
          quizId: string;
          type: string;
          text: string;
          options: string[];
          correctAnswer: string;
          createdAt: string;
          updatedAt: string;
        }>('/questions', {
          method: 'POST',
          body: JSON.stringify({
            quizId: createdQuizId,
            type: 'MCQ',
            text: 'Which number comes after 3?',
            options: ['2', '4'],
            correctAnswer: '4',
          }),
        });

        expect(questionResult.status).toBe(201);
        expect(questionResult.body.quizId).toBe(createdQuizId);
        expect(questionResult.body.correctAnswer).toBe('4');

        const publishResult = await fetchJson<CreatedQuiz>(
          `/admin/quizzes/${createdQuizId}/publish`,
          {
            method: 'POST',
          },
        );

        expect(publishResult.status).toBe(200);
        expect(publishResult.body.status).toBe('PUBLISHED');

        const unpublishResult = await fetchJson<CreatedQuiz>(
          `/admin/quizzes/${createdQuizId}/unpublish`,
          {
            method: 'POST',
          },
        );

        expect(unpublishResult.status).toBe(200);
        expect(unpublishResult.body.status).toBe('DRAFT');

        const deleteResult = await fetchJson<{ deleted: boolean; id: string }>(
          `/admin/quizzes/${createdQuizId}`,
          {
            method: 'DELETE',
          },
        );

        expect(deleteResult.status).toBe(200);
        expect(deleteResult.body).toEqual({
          deleted: true,
          id: createdQuizId,
        });
        createdQuizId = null;

        const missingResult = await fetch(
          `${LIVE_API_BASE_URL}/admin/quizzes/${deleteResult.body.id}`,
        );

        expect(missingResult.status).toBe(404);
      } finally {
        await deleteQuizIfPresent(createdQuizId);
      }
    });
  },
);
