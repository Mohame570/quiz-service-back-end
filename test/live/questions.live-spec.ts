import { LIVE_API_BASE_URL, waitForApi } from './helpers/live-client';

const runLiveTests = process.env.LIVE_TESTS === '1';

(runLiveTests ? describe : describe.skip)('Live server — questions', () => {
  let createdQuestionId: string;
  const quizId = 'quiz-3'; // DRAFT quiz

  beforeAll(async () => {
    await waitForApi();
  }, 90_000);

  it('creates an MCQ question for the seeded quiz', async () => {
    const response = await fetch(`${LIVE_API_BASE_URL}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quizId,
        type: 'MCQ',
        text: 'What is the capital of France?',
        options: ['Paris', 'London', 'Berlin', 'Madrid'],
        correctAnswer: 'Paris',
      }),
    });
    const body = (await response.json()) as any;

    expect(response.status).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.text).toBe('What is the capital of France?');
    expect(body.type).toBe('MCQ');
    expect(body.quizId).toBe(quizId);

    createdQuestionId = body.id;
  });

  it('fails to create an MCQ question with an invalid correct answer', async () => {
    const response = await fetch(`${LIVE_API_BASE_URL}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quizId,
        type: 'MCQ',
        text: 'What is 2+2?',
        options: ['3', '4', '5'],
        correctAnswer: '6',
      }),
    });

    expect(response.status).toBe(400);
  });

  it('updates the created question', async () => {
    const response = await fetch(
      `${LIVE_API_BASE_URL}/questions/${createdQuestionId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'What is the capital of France (updated)?',
          correctAnswer: 'Paris',
        }),
      },
    );
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.text).toBe('What is the capital of France (updated)?');
  });

  it('creates SHORT_TEXT and ESSAY questions', async () => {
    const shortTextResponse = await fetch(`${LIVE_API_BASE_URL}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quizId,
        type: 'SHORT_TEXT',
        text: 'Name the capital of France',
        correctAnswer: 'Paris',
      }),
    });
    const shortTextBody = (await shortTextResponse.json()) as any;
    expect(shortTextResponse.status).toBe(201);
    expect(shortTextBody.type).toBe('SHORT_TEXT');

    const essayResponse = await fetch(`${LIVE_API_BASE_URL}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quizId,
        type: 'ESSAY',
        text: 'Explain the difference between HTTP and HTTPS.',
      }),
    });
    const essayBody = (await essayResponse.json()) as any;
    expect(essayResponse.status).toBe(201);
    expect(essayBody.type).toBe('ESSAY');
    expect(essayBody.correctAnswer).toBe('');

    await fetch(`${LIVE_API_BASE_URL}/questions/${shortTextBody.id}`, {
      method: 'DELETE',
    });
    await fetch(`${LIVE_API_BASE_URL}/questions/${essayBody.id}`, {
      method: 'DELETE',
    });
  });

  it('fails to create an MCQ question with duplicate options', async () => {
    const response = await fetch(`${LIVE_API_BASE_URL}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quizId,
        type: 'MCQ',
        text: 'Duplicate?',
        options: ['A', 'A', 'B'],
        correctAnswer: 'A',
      }),
    });
    expect(response.status).toBe(400);
  });

  it('deletes the created question', async () => {
    const response = await fetch(
      `${LIVE_API_BASE_URL}/questions/${createdQuestionId}`,
      {
        method: 'DELETE',
      },
    );

    expect(response.status).toBe(200);
  });
});
