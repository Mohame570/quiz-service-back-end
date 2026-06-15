import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  EmailDeliveryStatus,
  NotificationTemplateKey,
} from '../src/generated/prisma/client';
import { MailTransportService } from '../src/modules/notifications/services/mail-transport.service';
import { NotificationService } from '../src/modules/notifications/services/notification.service';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeMailTransportMock(
  overrides: Partial<{ sendMail: jest.Mock }> = {},
) {
  return {
    sendMail: jest.fn().mockResolvedValue({ messageId: 'smtp-msg-123' }),
    ...overrides,
  };
}

function makeDeliveryPrismaMock(options: {
  id?: string;
  templateKey?: NotificationTemplateKey;
  failSend?: boolean;
} = {}) {
  const rendered = {
    html: '<p>Rendered HTML</p>',
    text: 'Rendered text body',
  };

  let currentLog: Record<string, unknown> = {
    id: options.id ?? 'log-1',
    recipientEmail: 'student@example.com',
    subject: 'Verify your email address',
    templateKey: options.templateKey ?? NotificationTemplateKey.VERIFICATION,
    status: EmailDeliveryStatus.PENDING,
    metadata: { rendered },
    attemptCount: 0,
    errorMessage: null,
    providerMessageId: null,
    deliveredAt: null,
    correlationId: null,
    lastAttemptAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
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
        };
        return currentLog;
      }),
      findMany: jest.fn().mockImplementation(async () =>
        currentLog.status === EmailDeliveryStatus.FAILED ? [currentLog] : [],
      ),
    },
    _getLog: () => currentLog,
    _setLog: (patch: Record<string, unknown>) => {
      currentLog = { ...currentLog, ...patch };
    },
  };
}

function buildService(
  prisma: ReturnType<typeof makeDeliveryPrismaMock>,
  mailTransport: ReturnType<typeof makeMailTransportMock>,
) {
  return new NotificationService(
    prisma as unknown as ConstructorParameters<typeof NotificationService>[0],
    mailTransport as unknown as MailTransportService,
  );
}

// ---------------------------------------------------------------------------
// sendVerificationEmail
// ---------------------------------------------------------------------------

describe('NotificationService.sendVerificationEmail (Sprint 2)', () => {
  it('creates a delivery log, sends via SMTP, and returns SENT', async () => {
    const prisma = makeDeliveryPrismaMock();
    const mailTransport = makeMailTransportMock();
    const service = buildService(prisma, mailTransport);

    const result = await service.sendVerificationEmail({
      recipientEmail: 'student@example.com',
      verificationUrl: 'https://example.com/verify?token=abc',
      correlationId: 'auth-register-1',
    });

    expect(prisma.emailDeliveryLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientEmail: 'student@example.com',
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

    expect(mailTransport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'student@example.com',
        subject: 'Verify your email address',
      }),
    );

    expect(result.status).toBe(EmailDeliveryStatus.SENT);
    expect(result.providerMessageId).toBe('smtp-msg-123');
    expect(result.attemptCount).toBe(1);
    expect(result.deliveredAt).toBeTruthy();
  });

  it('marks the log FAILED and returns error details when SMTP fails', async () => {
    const prisma = makeDeliveryPrismaMock();
    const mailTransport = makeMailTransportMock({
      sendMail: jest.fn().mockRejectedValue(new Error('SMTP connection refused')),
    });
    const service = buildService(prisma, mailTransport);

    const result = await service.sendVerificationEmail({
      recipientEmail: 'fail@example.com',
      verificationUrl: 'https://example.com/verify',
    });

    expect(result.status).toBe(EmailDeliveryStatus.FAILED);
    expect(result.errorMessage).toBe('SMTP connection refused');
    expect(result.attemptCount).toBe(1);
    expect(result.deliveredAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// sendQuizInvitationEmail
// ---------------------------------------------------------------------------

describe('NotificationService.sendQuizInvitationEmail (Sprint 2)', () => {
  it('sends quiz invitation email and logs SENT status', async () => {
    const prisma = makeDeliveryPrismaMock({
      templateKey: NotificationTemplateKey.QUIZ_INVITATION,
    });
    const mailTransport = makeMailTransportMock();
    const service = buildService(prisma, mailTransport);

    const result = await service.sendQuizInvitationEmail({
      recipientEmail: 'invitee@example.com',
      quizTitle: 'Algorithms Quiz',
      invitationUrl: 'https://example.com/quizzes/1',
      invitedByName: 'Admin',
    });

    expect(result.templateKey).toBe(NotificationTemplateKey.QUIZ_INVITATION);
    expect(result.status).toBe(EmailDeliveryStatus.SENT);
    expect(result.subject).toBe('Quiz invitation: Algorithms Quiz');
    expect(mailTransport.sendMail).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// resendDeliveryLog
// ---------------------------------------------------------------------------

describe('NotificationService.resendDeliveryLog', () => {
  it('resends a FAILED log and returns SENT on success', async () => {
    const prisma = makeDeliveryPrismaMock({ id: 'failed-log' });
    prisma._setLog({
      status: EmailDeliveryStatus.FAILED,
      errorMessage: 'previous failure',
      attemptCount: 1,
    });
    const mailTransport = makeMailTransportMock();
    const service = buildService(prisma, mailTransport);

    const result = await service.resendDeliveryLog('failed-log');

    expect(mailTransport.sendMail).toHaveBeenCalled();
    expect(result.status).toBe(EmailDeliveryStatus.SENT);
    expect(result.attemptCount).toBe(2);
  });

  it('throws NotFoundException for unknown log id', async () => {
    const prisma = makeDeliveryPrismaMock();
    prisma.emailDeliveryLog.findUnique.mockResolvedValueOnce(null);
    const service = buildService(prisma, makeMailTransportMock());

    await expect(service.resendDeliveryLog('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws BadRequestException when log is already SENT', async () => {
    const prisma = makeDeliveryPrismaMock();
    prisma._setLog({ status: EmailDeliveryStatus.SENT });
    const service = buildService(prisma, makeMailTransportMock());

    await expect(service.resendDeliveryLog('log-1')).rejects.toThrow(
      BadRequestException,
    );
  });
});

// ---------------------------------------------------------------------------
// resendFailedDeliveries
// ---------------------------------------------------------------------------

describe('NotificationService.resendFailedDeliveries', () => {
  it('retries all FAILED logs and returns batch summary', async () => {
    const prisma = makeDeliveryPrismaMock();
    prisma.emailDeliveryLog.findMany.mockResolvedValueOnce([
      {
        id: 'failed-1',
        recipientEmail: 'a@example.com',
        subject: 'Test',
        templateKey: NotificationTemplateKey.VERIFICATION,
        status: EmailDeliveryStatus.FAILED,
        metadata: {
          rendered: { html: '<p>a</p>', text: 'a' },
        },
        attemptCount: 1,
        errorMessage: 'timeout',
        providerMessageId: null,
        deliveredAt: null,
        correlationId: null,
        lastAttemptAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'failed-2',
        recipientEmail: 'b@example.com',
        subject: 'Test 2',
        templateKey: NotificationTemplateKey.QUIZ_INVITATION,
        status: EmailDeliveryStatus.FAILED,
        metadata: {
          rendered: { html: '<p>b</p>', text: 'b' },
        },
        attemptCount: 1,
        errorMessage: 'timeout',
        providerMessageId: null,
        deliveredAt: null,
        correlationId: null,
        lastAttemptAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const mailTransport = makeMailTransportMock();
    const service = buildService(prisma, mailTransport);

    const batch = await service.resendFailedDeliveries({ limit: 10 });

    expect(batch.attempted).toBe(2);
    expect(batch.sent).toBe(2);
    expect(batch.failed).toBe(0);
    expect(batch.results).toHaveLength(2);
    expect(mailTransport.sendMail).toHaveBeenCalledTimes(2);
  });

  it('filters FAILED logs by templateKey when provided', async () => {
    const prisma = makeDeliveryPrismaMock();
    prisma.emailDeliveryLog.findMany.mockResolvedValueOnce([]);
    const service = buildService(prisma, makeMailTransportMock());

    await service.resendFailedDeliveries({
      templateKey: NotificationTemplateKey.QUIZ_INVITATION,
      limit: 5,
    });

    expect(prisma.emailDeliveryLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: EmailDeliveryStatus.FAILED,
          templateKey: NotificationTemplateKey.QUIZ_INVITATION,
        },
        take: 5,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// listDeliveryLogs
// ---------------------------------------------------------------------------

describe('NotificationService.listDeliveryLogs', () => {
  it('returns delivery log summaries ordered by createdAt desc', async () => {
    const prisma = makeDeliveryPrismaMock();
    const now = new Date();
    prisma.emailDeliveryLog.findMany.mockResolvedValueOnce([
      {
        id: 'log-1',
        recipientEmail: 'a@example.com',
        subject: 'Subject',
        templateKey: NotificationTemplateKey.VERIFICATION,
        status: EmailDeliveryStatus.SENT,
        correlationId: 'corr-1',
        errorMessage: null,
        attemptCount: 1,
        providerMessageId: 'msg-1',
        lastAttemptAt: now,
        deliveredAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const service = buildService(prisma, makeMailTransportMock());
    const logs = await service.listDeliveryLogs({
      status: EmailDeliveryStatus.SENT,
      limit: 10,
    });

    expect(logs).toHaveLength(1);
    expect(logs[0].recipientEmail).toBe('a@example.com');
    expect(logs[0].status).toBe(EmailDeliveryStatus.SENT);
  });
});
