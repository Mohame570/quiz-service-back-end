import {
  CheatingEventType,
  EmailDeliveryStatus,
  NotificationTemplateKey,
} from '../src/generated/prisma/client';
import { IntegrityService } from '../src/modules/integrity/services/integrity.service';
import { MailTransportService } from '../src/modules/notifications/services/mail-transport.service';
import { NotificationService } from '../src/modules/notifications/services/notification.service';
import { escapeHtml, formatUtcDate } from '../src/modules/notifications/templates/template.helpers';
import { renderVerificationEmailTemplate } from '../src/modules/notifications/templates/verification-email.template';
import { renderQuizInvitationEmailTemplate } from '../src/modules/notifications/templates/quiz-invitation-email.template';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmailDeliveryLogMock(overrides: Record<string, unknown> = {}) {
  const rendered = { html: '<p>test</p>', text: 'test body' };
  let currentLog = {
    id: 'delivery-log-1',
    recipientEmail: 'student@example.com',
    subject: 'Verify your email address',
    status: EmailDeliveryStatus.PENDING,
    templateKey: NotificationTemplateKey.VERIFICATION,
    metadata: { rendered },
    attemptCount: 0,
    errorMessage: null,
    providerMessageId: null,
    deliveredAt: null,
    correlationId: null,
    lastAttemptAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };

  return {
    emailDeliveryLog: {
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        currentLog = { ...currentLog, ...data, id: currentLog.id };
        return currentLog;
      }),
      findUnique: jest.fn().mockImplementation(async () => currentLog),
      update: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const attemptIncrement =
          data.attemptCount &&
          typeof data.attemptCount === 'object' &&
          'increment' in data.attemptCount
            ? (data.attemptCount as { increment: number }).increment
            : 0;

        currentLog = {
          ...currentLog,
          ...data,
          attemptCount: (currentLog.attemptCount as number) + attemptIncrement,
          ...(data.status === EmailDeliveryStatus.SENT
            ? {
                deliveredAt: data.deliveredAt ?? new Date(),
                providerMessageId: data.providerMessageId ?? 'smtp-msg-1',
              }
            : {}),
        };
        return currentLog;
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

function makeMailTransportMock() {
  return {
    sendMail: jest.fn().mockResolvedValue({ messageId: 'smtp-msg-1' }),
  };
}

function makeNotificationService(prisma: ReturnType<typeof makeEmailDeliveryLogMock>) {
  return new NotificationService(
    prisma as unknown as ConstructorParameters<typeof NotificationService>[0],
    makeMailTransportMock() as unknown as MailTransportService,
  );
}

function makeCheatingEventLogMock(overrides: Record<string, unknown> = {}) {
  return {
    cheatingEventLog: {
      create: jest.fn().mockResolvedValue({
        id: 'cheating-event-1',
        attemptId: 'attempt-123',
        eventType: CheatingEventType.TAB_HIDDEN,
        ...overrides,
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Template helpers
// ---------------------------------------------------------------------------

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than signs', () => {
    expect(escapeHtml('<script>')).toContain('&lt;');
  });

  it('escapes greater-than signs', () => {
    expect(escapeHtml('<script>')).toContain('&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"value"')).toBe('&quot;value&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('handles all five special chars in one string', () => {
    expect(escapeHtml(`<a href="url">&'x'</a>`)).toBe(
      '&lt;a href=&quot;url&quot;&gt;&amp;&#39;x&#39;&lt;/a&gt;',
    );
  });

  it('returns plain strings unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('returns an empty string unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('formatUtcDate', () => {
  it('formats a UTC date in the expected human-readable form', () => {
    const date = new Date('2025-06-15T10:30:00.000Z');
    expect(formatUtcDate(date)).toBe('2025-06-15 10:30:00 UTC');
  });

  it('formats a midnight date correctly', () => {
    const date = new Date('2025-01-01T00:00:00.000Z');
    expect(formatUtcDate(date)).toBe('2025-01-01 00:00:00 UTC');
  });

  it('formats a date with non-zero minutes and seconds correctly', () => {
    const date = new Date('2024-12-31T23:59:59.000Z');
    expect(formatUtcDate(date)).toBe('2024-12-31 23:59:59 UTC');
  });
});

// ---------------------------------------------------------------------------
// Verification email template
// ---------------------------------------------------------------------------

describe('renderVerificationEmailTemplate', () => {
  const baseInput = {
    recipientEmail: 'student@example.com',
    verificationUrl: 'https://example.com/verify?token=abc',
  };

  it('returns the correct fixed subject line', () => {
    const { subject } = renderVerificationEmailTemplate(baseInput);
    expect(subject).toBe('Verify your email address');
  });

  it('uses a generic greeting when recipientName is omitted', () => {
    const { html, text } = renderVerificationEmailTemplate(baseInput);
    expect(html).toContain('Hi,');
    expect(text).toContain('Hi,');
  });

  it('personalises the greeting when recipientName is provided', () => {
    const { html, text } = renderVerificationEmailTemplate({
      ...baseInput,
      recipientName: 'Alice',
    });
    expect(html).toContain('Hi Alice,');
    expect(text).toContain('Hi Alice,');
  });

  it('uses generic expiry copy when expiresInHours is omitted', () => {
    const { html, text } = renderVerificationEmailTemplate(baseInput);
    expect(html).toContain('Use the link below to verify your email address.');
    expect(text).toContain('Use the link below to verify your email address.');
  });

  it('includes expiry hours in the copy when expiresInHours is provided', () => {
    const { html, text } = renderVerificationEmailTemplate({
      ...baseInput,
      expiresInHours: 48,
    });
    expect(html).toContain('48 hours');
    expect(text).toContain('48 hours');
  });

  it('embeds the verification URL as an href in the HTML', () => {
    const { html } = renderVerificationEmailTemplate(baseInput);
    expect(html).toContain('href="https://example.com/verify?token=abc"');
  });

  it('embeds the plain verification URL in the text body', () => {
    const { text } = renderVerificationEmailTemplate(baseInput);
    expect(text).toContain('https://example.com/verify?token=abc');
  });

  it('contains a human-readable call-to-action in the HTML', () => {
    const { html } = renderVerificationEmailTemplate(baseInput);
    expect(html).toContain('Verify your email');
  });

  it('escapes a malicious recipientName in the HTML output', () => {
    const { html } = renderVerificationEmailTemplate({
      ...baseInput,
      recipientName: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes a malicious verification URL in the HTML href', () => {
    const xssUrl = 'https://evil.com/?x="onload=alert(1)';
    const { html } = renderVerificationEmailTemplate({
      ...baseInput,
      verificationUrl: xssUrl,
    });
    expect(html).not.toContain('"onload=alert(1)');
    expect(html).toContain('&quot;');
  });

  it('does not HTML-escape the URL in the plain-text body', () => {
    const url = 'https://example.com/verify?a=1&b=2';
    const { text } = renderVerificationEmailTemplate({
      ...baseInput,
      verificationUrl: url,
    });
    // Plain text should contain the raw URL as-is
    expect(text).toContain(url);
  });
});

// ---------------------------------------------------------------------------
// Quiz invitation email template
// ---------------------------------------------------------------------------

describe('renderQuizInvitationEmailTemplate', () => {
  const baseInput = {
    recipientEmail: 'student@example.com',
    quizTitle: 'Sprint 1 Quiz',
    invitationUrl: 'https://example.com/quizzes/sprint-1',
  };

  it('builds the subject line from the quiz title', () => {
    const { subject } = renderQuizInvitationEmailTemplate(baseInput);
    expect(subject).toBe('Quiz invitation: Sprint 1 Quiz');
  });

  it('uses a generic greeting when recipientName is omitted', () => {
    const { html, text } = renderQuizInvitationEmailTemplate(baseInput);
    expect(html).toContain('Hi,');
    expect(text).toContain('Hi,');
  });

  it('personalises the greeting when recipientName is provided', () => {
    const { html, text } = renderQuizInvitationEmailTemplate({
      ...baseInput,
      recipientName: 'Bob',
    });
    expect(html).toContain('Hi Bob,');
    expect(text).toContain('Hi Bob,');
  });

  it('uses generic invitation copy when invitedByName is omitted', () => {
    const { html, text } = renderQuizInvitationEmailTemplate(baseInput);
    expect(html).toContain('You have been invited');
    expect(text).toContain('You have been invited');
    expect(html).not.toContain('invited by');
  });

  it('names the inviter when invitedByName is provided', () => {
    const { html, text } = renderQuizInvitationEmailTemplate({
      ...baseInput,
      invitedByName: 'Quiz Admin',
    });
    expect(html).toContain('Quiz Admin');
    expect(text).toContain('Quiz Admin');
  });

  it('uses generic availability copy when availableUntil is omitted', () => {
    const { html, text } = renderQuizInvitationEmailTemplate(baseInput);
    expect(html).toContain('Use the link below to join the quiz.');
    expect(text).toContain('Use the link below to join the quiz.');
  });

  it('includes deadline copy when availableUntil is provided', () => {
    const deadline = new Date('2025-07-01T12:00:00.000Z');
    const { html, text } = renderQuizInvitationEmailTemplate({
      ...baseInput,
      availableUntil: deadline,
    });
    expect(html).toContain('2025-07-01 12:00:00 UTC');
    expect(text).toContain('2025-07-01 12:00:00 UTC');
  });

  it('embeds the invitation URL as an href in the HTML', () => {
    const { html } = renderQuizInvitationEmailTemplate(baseInput);
    expect(html).toContain(`href="${baseInput.invitationUrl}"`);
  });

  it('embeds the plain invitation URL in the text body', () => {
    const { text } = renderQuizInvitationEmailTemplate(baseInput);
    expect(text).toContain(baseInput.invitationUrl);
  });

  it('includes the quiz title in the HTML body', () => {
    const { html } = renderQuizInvitationEmailTemplate(baseInput);
    expect(html).toContain('Sprint 1 Quiz');
  });

  it('escapes a malicious quiz title in the HTML output', () => {
    const { html } = renderQuizInvitationEmailTemplate({
      ...baseInput,
      quizTitle: '<img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('escapes a malicious invitedByName in the HTML output', () => {
    const { html } = renderQuizInvitationEmailTemplate({
      ...baseInput,
      invitedByName: '"><svg/onload=alert(1)>',
    });
    expect(html).not.toContain('<svg');
    expect(html).toContain('&lt;svg');
  });
});

// ---------------------------------------------------------------------------
// NotificationService — queueVerificationEmail
// ---------------------------------------------------------------------------

describe('NotificationService.queueVerificationEmail', () => {
  it('creates a PENDING delivery log with correct fields', async () => {
    const prisma = makeEmailDeliveryLogMock({
      templateKey: NotificationTemplateKey.VERIFICATION,
    });
    const service = makeNotificationService(prisma);

    await service.queueVerificationEmail({
      recipientEmail: 'student@example.com',
      recipientName: 'Student',
      verificationUrl: 'https://example.com/verify?token=abc',
      expiresInHours: 24,
      correlationId: 'auth-register-1',
    });

    expect(prisma.emailDeliveryLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientEmail: 'student@example.com',
          subject: 'Verify your email address',
          templateKey: NotificationTemplateKey.VERIFICATION,
          status: EmailDeliveryStatus.PENDING,
          correlationId: 'auth-register-1',
          metadata: expect.objectContaining({
            rendered: expect.objectContaining({
              html: expect.any(String),
              text: expect.any(String),
            }),
          }),
        }),
      }),
    );
  });

  it('returns the delivery log id from the created record', async () => {
    const prisma = makeEmailDeliveryLogMock({
      id: 'my-log-id',
      templateKey: NotificationTemplateKey.VERIFICATION,
    });
    const service = makeNotificationService(prisma);

    const result = await service.queueVerificationEmail({
      recipientEmail: 'a@b.com',
      verificationUrl: 'https://example.com/v',
    });

    expect(result.deliveryLogId).toBe('my-log-id');
  });

  it('returns PENDING status', async () => {
    const prisma = makeEmailDeliveryLogMock({
      templateKey: NotificationTemplateKey.VERIFICATION,
    });
    const service = makeNotificationService(prisma);

    const result = await service.queueVerificationEmail({
      recipientEmail: 'a@b.com',
      verificationUrl: 'https://example.com/v',
    });

    expect(result.status).toBe(EmailDeliveryStatus.SENT);
  });

  it('returns the VERIFICATION template key', async () => {
    const prisma = makeEmailDeliveryLogMock({
      templateKey: NotificationTemplateKey.VERIFICATION,
    });
    const service = makeNotificationService(prisma);

    const result = await service.queueVerificationEmail({
      recipientEmail: 'a@b.com',
      verificationUrl: 'https://example.com/v',
    });

    expect(result.templateKey).toBe(NotificationTemplateKey.VERIFICATION);
  });

  it('returns rendered html containing the CTA text', async () => {
    const prisma = makeEmailDeliveryLogMock({
      templateKey: NotificationTemplateKey.VERIFICATION,
    });
    const service = makeNotificationService(prisma);

    const result = await service.queueVerificationEmail({
      recipientEmail: 'a@b.com',
      verificationUrl: 'https://example.com/verify',
    });

    expect(result.html).toContain('Verify your email');
  });

  it('returns rendered text containing the verification URL', async () => {
    const prisma = makeEmailDeliveryLogMock({
      templateKey: NotificationTemplateKey.VERIFICATION,
    });
    const service = makeNotificationService(prisma);

    const result = await service.queueVerificationEmail({
      recipientEmail: 'a@b.com',
      verificationUrl: 'https://example.com/verify?token=xyz',
    });

    expect(result.text).toContain('https://example.com/verify?token=xyz');
  });

  it('omits correlationId from the Prisma payload when not provided', async () => {
    const prisma = makeEmailDeliveryLogMock({
      templateKey: NotificationTemplateKey.VERIFICATION,
    });
    const service = makeNotificationService(prisma);

    await service.queueVerificationEmail({
      recipientEmail: 'a@b.com',
      verificationUrl: 'https://example.com/v',
    });

    const callArg = prisma.emailDeliveryLog.create.mock.calls[0][0];
    expect(callArg.data).not.toHaveProperty('correlationId');
  });

  it('passes metadata through to the Prisma payload when provided', async () => {
    const prisma = makeEmailDeliveryLogMock({
      templateKey: NotificationTemplateKey.VERIFICATION,
    });
    const service = makeNotificationService(prisma);
    const meta = { source: 'registration-flow', attempt: 1 };

    await service.queueVerificationEmail({
      recipientEmail: 'a@b.com',
      verificationUrl: 'https://example.com/v',
      metadata: meta,
    });

    const callArg = prisma.emailDeliveryLog.create.mock.calls[0][0];
    expect(callArg.data.metadata).toEqual(
      expect.objectContaining({
        source: 'registration-flow',
        attempt: 1,
        rendered: expect.objectContaining({
          html: expect.any(String),
          text: expect.any(String),
        }),
      }),
    );
  });

  it('stores rendered content in metadata when caller metadata is omitted', async () => {
    const prisma = makeEmailDeliveryLogMock({
      templateKey: NotificationTemplateKey.VERIFICATION,
    });
    const service = makeNotificationService(prisma);

    await service.queueVerificationEmail({
      recipientEmail: 'a@b.com',
      verificationUrl: 'https://example.com/v',
    });

    const callArg = prisma.emailDeliveryLog.create.mock.calls[0][0];
    expect(callArg.data.metadata).toEqual(
      expect.objectContaining({
        rendered: expect.objectContaining({
          html: expect.any(String),
          text: expect.any(String),
        }),
      }),
    );
  });

  it('returns the correct subject in the result', async () => {
    const prisma = makeEmailDeliveryLogMock({
      templateKey: NotificationTemplateKey.VERIFICATION,
    });
    const service = makeNotificationService(prisma);

    const result = await service.queueVerificationEmail({
      recipientEmail: 'a@b.com',
      verificationUrl: 'https://example.com/v',
    });

    expect(result.subject).toBe('Verify your email address');
  });
});

// ---------------------------------------------------------------------------
// NotificationService — queueQuizInvitationEmail
// ---------------------------------------------------------------------------

describe('NotificationService.queueQuizInvitationEmail', () => {
  it('creates a PENDING delivery log with correct fields', async () => {
    const prisma = makeEmailDeliveryLogMock({
      id: 'delivery-log-2',
      templateKey: NotificationTemplateKey.QUIZ_INVITATION,
      subject: 'Quiz invitation: Sprint 1 Quiz',
    });
    const service = makeNotificationService(prisma);

    await service.queueQuizInvitationEmail({
      recipientEmail: 'student@example.com',
      quizTitle: 'Sprint 1 Quiz',
      invitationUrl: 'https://example.com/quizzes/sprint-1',
      invitedByName: 'Quiz Admin',
      correlationId: 'quiz-invite-1',
    });

    expect(prisma.emailDeliveryLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientEmail: 'student@example.com',
          subject: 'Quiz invitation: Sprint 1 Quiz',
          templateKey: NotificationTemplateKey.QUIZ_INVITATION,
          status: EmailDeliveryStatus.PENDING,
          correlationId: 'quiz-invite-1',
        }),
      }),
    );
  });

  it('returns the delivery log id from the created record', async () => {
    const prisma = makeEmailDeliveryLogMock({
      id: 'quiz-log-99',
      templateKey: NotificationTemplateKey.QUIZ_INVITATION,
    });
    const service = makeNotificationService(prisma);

    const result = await service.queueQuizInvitationEmail({
      recipientEmail: 'a@b.com',
      quizTitle: 'My Quiz',
      invitationUrl: 'https://example.com/q',
    });

    expect(result.deliveryLogId).toBe('quiz-log-99');
  });

  it('returns the QUIZ_INVITATION template key', async () => {
    const prisma = makeEmailDeliveryLogMock({
      templateKey: NotificationTemplateKey.QUIZ_INVITATION,
    });
    const service = makeNotificationService(prisma);

    const result = await service.queueQuizInvitationEmail({
      recipientEmail: 'a@b.com',
      quizTitle: 'My Quiz',
      invitationUrl: 'https://example.com/q',
    });

    expect(result.templateKey).toBe(NotificationTemplateKey.QUIZ_INVITATION);
  });

  it('includes the quiz title in the returned subject', async () => {
    const prisma = makeEmailDeliveryLogMock({
      templateKey: NotificationTemplateKey.QUIZ_INVITATION,
    });
    const service = makeNotificationService(prisma);

    const result = await service.queueQuizInvitationEmail({
      recipientEmail: 'a@b.com',
      quizTitle: 'Advanced Algorithms',
      invitationUrl: 'https://example.com/q',
    });

    expect(result.subject).toBe('Quiz invitation: Advanced Algorithms');
  });

  it('includes the inviter name in the returned text', async () => {
    const prisma = makeEmailDeliveryLogMock({
      templateKey: NotificationTemplateKey.QUIZ_INVITATION,
    });
    const service = makeNotificationService(prisma);

    const result = await service.queueQuizInvitationEmail({
      recipientEmail: 'a@b.com',
      quizTitle: 'My Quiz',
      invitationUrl: 'https://example.com/q',
      invitedByName: 'Prof. Smith',
    });

    expect(result.text).toContain('Prof. Smith');
  });

  it('includes the quiz title in the returned HTML', async () => {
    const prisma = makeEmailDeliveryLogMock({
      templateKey: NotificationTemplateKey.QUIZ_INVITATION,
    });
    const service = makeNotificationService(prisma);

    const result = await service.queueQuizInvitationEmail({
      recipientEmail: 'a@b.com',
      quizTitle: 'Sprint 1 Quiz',
      invitationUrl: 'https://example.com/q',
    });

    expect(result.html).toContain('Sprint 1 Quiz');
  });

  it('omits correlationId from the Prisma payload when not provided', async () => {
    const prisma = makeEmailDeliveryLogMock({
      templateKey: NotificationTemplateKey.QUIZ_INVITATION,
    });
    const service = makeNotificationService(prisma);

    await service.queueQuizInvitationEmail({
      recipientEmail: 'a@b.com',
      quizTitle: 'My Quiz',
      invitationUrl: 'https://example.com/q',
    });

    const callArg = prisma.emailDeliveryLog.create.mock.calls[0][0];
    expect(callArg.data).not.toHaveProperty('correlationId');
  });

  it('passes metadata through to the Prisma payload when provided', async () => {
    const prisma = makeEmailDeliveryLogMock({
      templateKey: NotificationTemplateKey.QUIZ_INVITATION,
    });
    const service = makeNotificationService(prisma);
    const meta = { quizId: 'q-42', cohort: 'cs2025' };

    await service.queueQuizInvitationEmail({
      recipientEmail: 'a@b.com',
      quizTitle: 'My Quiz',
      invitationUrl: 'https://example.com/q',
      metadata: meta,
    });

    const callArg = prisma.emailDeliveryLog.create.mock.calls[0][0];
    expect(callArg.data.metadata).toEqual(
      expect.objectContaining({
        quizId: 'q-42',
        cohort: 'cs2025',
        rendered: expect.objectContaining({
          html: expect.any(String),
          text: expect.any(String),
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// IntegrityService — recordCheatingEvent
// ---------------------------------------------------------------------------

describe('IntegrityService.recordCheatingEvent', () => {
  it('creates a cheating event log with the required fields', async () => {
    const prisma = makeCheatingEventLogMock();
    const service = new IntegrityService(
      prisma as unknown as ConstructorParameters<typeof IntegrityService>[0],
    );

    await service.recordCheatingEvent({
      attemptId: 'attempt-123',
      eventType: CheatingEventType.TAB_HIDDEN,
      description: 'Student moved away from the quiz tab',
    });

    expect(prisma.cheatingEventLog.create).toHaveBeenCalledWith({
      data: {
        attemptId: 'attempt-123',
        eventType: CheatingEventType.TAB_HIDDEN,
        description: 'Student moved away from the quiz tab',
      },
    });
  });

  it('returns the created record id', async () => {
    const prisma = makeCheatingEventLogMock({ id: 'cheating-event-abc' });
    const service = new IntegrityService(
      prisma as unknown as ConstructorParameters<typeof IntegrityService>[0],
    );

    const result = await service.recordCheatingEvent({
      attemptId: 'attempt-123',
      eventType: CheatingEventType.TAB_HIDDEN,
    });

    expect(result.id).toBe('cheating-event-abc');
  });

  it('handles all CheatingEventType values without error', async () => {
    const allTypes = Object.values(CheatingEventType);

    for (const eventType of allTypes) {
      const prisma = makeCheatingEventLogMock({ eventType });
      const service = new IntegrityService(
        prisma as unknown as ConstructorParameters<typeof IntegrityService>[0],
      );

      await expect(
        service.recordCheatingEvent({ attemptId: 'attempt-1', eventType }),
      ).resolves.not.toThrow();
    }
  });

  it('omits description from the Prisma payload when not provided', async () => {
    const prisma = makeCheatingEventLogMock();
    const service = new IntegrityService(
      prisma as unknown as ConstructorParameters<typeof IntegrityService>[0],
    );

    await service.recordCheatingEvent({
      attemptId: 'attempt-123',
      eventType: CheatingEventType.WINDOW_BLUR,
    });

    const callArg = prisma.cheatingEventLog.create.mock.calls[0][0];
    expect(callArg.data).not.toHaveProperty('description');
  });

  it('passes occurredAt through to the Prisma payload when provided', async () => {
    const prisma = makeCheatingEventLogMock();
    const service = new IntegrityService(
      prisma as unknown as ConstructorParameters<typeof IntegrityService>[0],
    );
    const occurredAt = new Date('2025-06-10T09:00:00.000Z');

    await service.recordCheatingEvent({
      attemptId: 'attempt-123',
      eventType: CheatingEventType.COPY_PASTE,
      occurredAt,
    });

    const callArg = prisma.cheatingEventLog.create.mock.calls[0][0];
    expect(callArg.data.occurredAt).toEqual(occurredAt);
  });

  it('omits occurredAt from the Prisma payload when not provided', async () => {
    const prisma = makeCheatingEventLogMock();
    const service = new IntegrityService(
      prisma as unknown as ConstructorParameters<typeof IntegrityService>[0],
    );

    await service.recordCheatingEvent({
      attemptId: 'attempt-123',
      eventType: CheatingEventType.FULLSCREEN_EXIT,
    });

    const callArg = prisma.cheatingEventLog.create.mock.calls[0][0];
    expect(callArg.data).not.toHaveProperty('occurredAt');
  });

  it('passes metadata through to the Prisma payload when provided', async () => {
    const prisma = makeCheatingEventLogMock();
    const service = new IntegrityService(
      prisma as unknown as ConstructorParameters<typeof IntegrityService>[0],
    );
    const meta = { userAgent: 'Mozilla/5.0', screenCount: 2 };

    await service.recordCheatingEvent({
      attemptId: 'attempt-123',
      eventType: CheatingEventType.OTHER,
      metadata: meta,
    });

    const callArg = prisma.cheatingEventLog.create.mock.calls[0][0];
    expect(callArg.data.metadata).toEqual(meta);
  });

  it('omits metadata from the Prisma payload when not provided', async () => {
    const prisma = makeCheatingEventLogMock();
    const service = new IntegrityService(
      prisma as unknown as ConstructorParameters<typeof IntegrityService>[0],
    );

    await service.recordCheatingEvent({
      attemptId: 'attempt-123',
      eventType: CheatingEventType.WINDOW_FOCUS,
    });

    const callArg = prisma.cheatingEventLog.create.mock.calls[0][0];
    expect(callArg.data).not.toHaveProperty('metadata');
  });

  it('returns the correct attemptId and eventType from the created record', async () => {
    const prisma = makeCheatingEventLogMock({
      attemptId: 'attempt-999',
      eventType: CheatingEventType.COPY_PASTE,
    });
    const service = new IntegrityService(
      prisma as unknown as ConstructorParameters<typeof IntegrityService>[0],
    );

    const result = await service.recordCheatingEvent({
      attemptId: 'attempt-999',
      eventType: CheatingEventType.COPY_PASTE,
    });

    expect(result.attemptId).toBe('attempt-999');
    expect(result.eventType).toBe(CheatingEventType.COPY_PASTE);
  });
});