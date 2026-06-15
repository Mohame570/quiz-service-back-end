import {
  LIVE_API_BASE_URL,
  LIVE_TEST_CORRELATION_ID,
  fetchMailhogMessages,
  purgeMailhogMessages,
  waitForApi,
} from './helpers/live-client';

const runLiveTests = process.env.LIVE_TESTS === '1';

(runLiveTests ? describe : describe.skip)(
  'Live server — notifications (L7)',
  () => {
    beforeAll(async () => {
      await waitForApi();
      await purgeMailhogMessages();
    }, 90_000);

    it('health endpoint responds from the running stack', async () => {
      const response = await fetch(`${LIVE_API_BASE_URL}/health`);
      const body = (await response.json()) as { status: string };

      expect(response.status).toBe(200);
      expect(body.status).toBe('ok');
    });

    it('lists seeded failed delivery logs', async () => {
      const response = await fetch(
        `${LIVE_API_BASE_URL}/notifications/delivery-logs?status=FAILED`,
      );
      const body = (await response.json()) as Array<{ correlationId?: string }>;

      expect(response.status).toBe(200);
      expect(
        body.some((log) => log.correlationId === LIVE_TEST_CORRELATION_ID),
      ).toBe(true);
    });

    it('resends failed deliveries through SMTP and MailHog receives the email', async () => {
      const response = await fetch(
        `${LIVE_API_BASE_URL}/notifications/delivery-logs/resend-failed`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 10 }),
        },
      );
      const body = (await response.json()) as {
        attempted: number;
        sent: number;
      };

      expect(response.status).toBe(201);
      expect(body.attempted).toBeGreaterThanOrEqual(1);
      expect(body.sent).toBeGreaterThanOrEqual(1);

      const messages = await fetchMailhogMessages();
      const deliveredToStudent = messages.some((message) =>
        (message.Content.Headers.To ?? []).some((header) =>
          header.includes('student@live-test.example'),
        ),
      );

      expect(deliveredToStudent).toBe(true);
    });
  },
);
