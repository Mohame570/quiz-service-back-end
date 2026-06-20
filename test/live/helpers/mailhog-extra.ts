// Auth-specific MailHog helpers, built on top of live-client.ts.
// live-client.ts only exposes email headers — we need the body too,
// since that's where the verification link/token actually is.

import { LIVE_MAILHOG_API_URL } from './live-client';

export type MailhogMessage = {
  ID: string;
  Content: {
    Headers: Record<string, string[]>;
    Body: string;
  };
};

// Same as fetchMailhogMessages() in live-client.ts, but includes Body.
export async function fetchMailhogMessagesFull(): Promise<MailhogMessage[]> {
  const response = await fetch(`${LIVE_MAILHOG_API_URL}/messages`);
  if (!response.ok) {
    throw new Error(`MailHog API returned ${response.status}`);
  }

  const body = (await response.json()) as { items: MailhogMessage[] };
  return body.items ?? [];
}

// Mail bodies can be quoted-printable encoded (e.g. "=3D" -> "=").
// Minimal decode, just enough to recover a clean token from the URL.
function decodeQuotedPrintable(input: string): string {
  return input
    .replace(/=\r\n/g, '')
    .replace(/=\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// Polls MailHog until an email to `recipientEmail` shows up.
// Needed because sending is async — checking once right after the
// request fires is flaky.
export async function waitForMailToRecipient(
  recipientEmail: string,
  timeoutMs = 20_000,
): Promise<MailhogMessage> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const messages = await fetchMailhogMessagesFull();

    const match = messages.find((msg) =>
      (msg.Content.Headers['To'] ?? []).some((to) =>
        to.toLowerCase().includes(recipientEmail.toLowerCase()),
      ),
    );

    if (match) return match;

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`No email to ${recipientEmail} appeared in MailHog within ${timeoutMs}ms`);
}

// Pulls the token out of "...verify-email?token=XYZ" in the email body.
// Update the regex here if the verification URL shape ever changes.
export function extractVerificationToken(message: MailhogMessage): string {
  const decodedBody = decodeQuotedPrintable(message.Content.Body);
  const match = decodedBody.match(/token=([a-zA-Z0-9-]+)/);

  if (!match) {
    throw new Error('Could not find a verification token in the email body.');
  }

  return match[1];
}