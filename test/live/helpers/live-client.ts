export const LIVE_API_ORIGIN =
  process.env.LIVE_API_ORIGIN ?? 'http://localhost:3002';

export const LIVE_API_PREFIX = process.env.API_PREFIX ?? 'api';

export const LIVE_API_BASE_URL = `${LIVE_API_ORIGIN}/${LIVE_API_PREFIX}`;

export const LIVE_MAILHOG_API_URL =
  process.env.LIVE_MAILHOG_API_URL ?? 'http://localhost:8025/api/v2';

export const LIVE_TEST_CORRELATION_ID = 'live-test:failed-verification';

export async function waitForApi(
  baseUrl = LIVE_API_BASE_URL,
  timeoutMs = 60_000,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // API not ready yet.
    }

    await sleep(1_000);
  }

  throw new Error(`API did not become healthy at ${baseUrl}/health within ${timeoutMs}ms`);
}

export async function fetchMailhogMessages(): Promise<
  Array<{ Content: { Headers: Record<string, string[]> } }>
> {
  const response = await fetch(`${LIVE_MAILHOG_API_URL}/messages`);
  if (!response.ok) {
    throw new Error(`MailHog API returned ${response.status}`);
  }

  const body = (await response.json()) as {
    items: Array<{ Content: { Headers: Record<string, string[]> } }>;
  };

  return body.items ?? [];
}

export async function purgeMailhogMessages(): Promise<void> {
  await fetch(`${LIVE_MAILHOG_API_URL.replace('/api/v2', '/api/v1')}/messages`, {
    method: 'DELETE',
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
