import {
  CheatingEventType,
  EmailDeliveryStatus,
  NotificationTemplateKey,
} from '../src/generated/prisma/client';
import { IntegrityService } from '../src/modules/integrity/services/integrity.service';
import { NotificationService } from '../src/modules/notifications/services/notification.service';

describe('Notifications foundation', () => {
  it('queues a verification email through the shared notification service', async () => {
    const prisma = {
      emailDeliveryLog: {
        create: jest.fn().mockResolvedValue({
          id: 'delivery-log-1',
          status: EmailDeliveryStatus.PENDING,
          templateKey: NotificationTemplateKey.VERIFICATION,
        }),
      },
    };

    const service = new NotificationService(
      prisma as unknown as ConstructorParameters<typeof NotificationService>[0],
    );

    const result = await service.queueVerificationEmail({
      recipientEmail: 'student@example.com',
      recipientName: 'Student',
      verificationUrl: 'https://example.com/verify?token=abc',
      expiresInHours: 24,
      correlationId: 'auth-register-1',
    });

    expect(prisma.emailDeliveryLog.create).toHaveBeenCalledWith({
      data: {
        recipientEmail: 'student@example.com',
        subject: 'Verify your email address',
        templateKey: NotificationTemplateKey.VERIFICATION,
        status: EmailDeliveryStatus.PENDING,
        correlationId: 'auth-register-1',
      },
    });
    expect(result.deliveryLogId).toBe('delivery-log-1');
    expect(result.templateKey).toBe(NotificationTemplateKey.VERIFICATION);
    expect(result.html).toContain('Verify your email');
    expect(result.text).toContain('https://example.com/verify?token=abc');
  });

  it('queues a quiz invitation email with reusable template content', async () => {
    const prisma = {
      emailDeliveryLog: {
        create: jest.fn().mockResolvedValue({
          id: 'delivery-log-2',
          status: EmailDeliveryStatus.PENDING,
          templateKey: NotificationTemplateKey.QUIZ_INVITATION,
        }),
      },
    };

    const service = new NotificationService(
      prisma as unknown as ConstructorParameters<typeof NotificationService>[0],
    );

    const result = await service.queueQuizInvitationEmail({
      recipientEmail: 'student@example.com',
      quizTitle: 'Sprint 1 Quiz',
      invitationUrl: 'https://example.com/quizzes/sprint-1',
      invitedByName: 'Quiz Admin',
      correlationId: 'quiz-invite-1',
    });

    expect(prisma.emailDeliveryLog.create).toHaveBeenCalledWith({
      data: {
        recipientEmail: 'student@example.com',
        subject: 'Quiz invitation: Sprint 1 Quiz',
        templateKey: NotificationTemplateKey.QUIZ_INVITATION,
        status: EmailDeliveryStatus.PENDING,
        correlationId: 'quiz-invite-1',
      },
    });
    expect(result.subject).toBe('Quiz invitation: Sprint 1 Quiz');
    expect(result.text).toContain('Quiz Admin');
    expect(result.html).toContain('Sprint 1 Quiz');
  });

  it('records a cheating event without assuming an attempt relation shape', async () => {
    const prisma = {
      cheatingEventLog: {
        create: jest.fn().mockResolvedValue({
          id: 'cheating-event-1',
          attemptId: 'attempt-123',
          eventType: CheatingEventType.TAB_HIDDEN,
        }),
      },
    };

    const service = new IntegrityService(
      prisma as unknown as ConstructorParameters<typeof IntegrityService>[0],
    );

    const result = await service.recordCheatingEvent({
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
    expect(result.id).toBe('cheating-event-1');
  });
});
