import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  EmailDeliveryLog,
  EmailDeliveryStatus,
  InvitationStatus,
  NotificationTemplateKey,
  Prisma,
  QuizStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DeliveryLogSummaryDto } from '../dto/delivery-log-summary.dto';
import { ListDeliveryLogsQueryDto } from '../dto/list-delivery-logs-query.dto';
import { NotificationDispatchResultDto } from '../dto/notification-dispatch-result.dto';
import { ResendBatchResultDto } from '../dto/resend-batch-result.dto';
import { ResendFailedDeliveriesDto } from '../dto/resend-failed-deliveries.dto';
import { SendQuizInvitationAdminDto } from '../dto/send-quiz-invitation-admin.dto';
import { SendQuizInvitationEmailDto } from '../dto/send-quiz-invitation-email.dto';
import { SendVerificationEmailDto } from '../dto/send-verification-email.dto';
import { renderQuizInvitationEmailTemplate } from '../templates/quiz-invitation-email.template';
import { RenderedEmailTemplate } from '../templates/template.types';
import { renderVerificationEmailTemplate } from '../templates/verification-email.template';
import { NotificationServiceInterface } from './notification-service.interface';
import { MailTransportService } from './mail-transport.service';
import {
  DeliveryStatusCountsDto,
  DeliverySummaryDto,
  InvitationStatusDto,
} from '../dto/delivery-summary.dto';
import { SendQuizReminderEmailDto } from '../dto/send-quiz-invitation-reminder-email';
import { renderQuizReminderEmailTemplate } from '../templates/quiz-invitation-reminder-email.template';
import { SendPasswordResetEmailDto } from '../dto/send-password-reset-email.dto';
import { renderPasswordResetEmailTemplate } from '../templates/password-reset-email.template';

interface StoredRenderedContent {
  html: string;
  text: string;
}

@Injectable()
export class NotificationService implements NotificationServiceInterface {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailTransport: MailTransportService,
    private readonly configService: ConfigService,
  ) {}

  async sendVerificationEmail(
    input: SendVerificationEmailDto,
  ): Promise<NotificationDispatchResultDto> {
    const renderedTemplate = renderVerificationEmailTemplate(input);

    return this.dispatchEmail({
      recipientEmail: input.recipientEmail,
      templateKey: NotificationTemplateKey.VERIFICATION,
      renderedTemplate,
      correlationId: input.correlationId,
      metadata: input.metadata,
    });
  }

  async sendQuizInvitationEmail(
    input: SendQuizInvitationEmailDto,
  ): Promise<NotificationDispatchResultDto> {
    const renderedTemplate = renderQuizInvitationEmailTemplate(input);

    return this.dispatchEmail({
      recipientEmail: input.recipientEmail,
      templateKey: NotificationTemplateKey.QUIZ_INVITATION,
      renderedTemplate,
      correlationId: input.correlationId,
      metadata: input.metadata,
      invitationId: input.invitationId,
    });
  }

  async sendQuizReminderEmail(
    input: SendQuizReminderEmailDto,
  ): Promise<NotificationDispatchResultDto> {
    const renderedTemplate = renderQuizReminderEmailTemplate(input);

    return this.dispatchEmail({
      recipientEmail: input.recipientEmail,
      templateKey: NotificationTemplateKey.QUIZ_REMINDER,
      renderedTemplate,
      correlationId: input.correlationId,
      metadata: input.metadata,
      invitationId: input.invitationId,
    });
  }

  async sendPasswordResetEmail(
    input: SendPasswordResetEmailDto,
  ): Promise<NotificationDispatchResultDto> {
    const renderedTemplate = renderPasswordResetEmailTemplate(input);

    return this.dispatchEmail({
      recipientEmail: input.recipientEmail,
      templateKey: NotificationTemplateKey.PASSWORD_RESET,
      renderedTemplate,
      correlationId: input.correlationId,
      metadata: input.metadata,
    });
  }
  async sendQuizInvitationToStudents(
    input: SendQuizInvitationAdminDto,
    invitedByName?: string,
  ): Promise<{
    sent: number;
    failed: number;
    results: NotificationDispatchResultDto[];
  }> {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: input.quizId },
      select: { id: true, title: true, status: true },
    });

    if (!quiz) {
      throw new NotFoundException(`Quiz '${input.quizId}' not found.`);
    }

    if (quiz.status !== QuizStatus.PUBLISHED) {
      throw new BadRequestException(
        'Can only send invitations for published quizzes.',
      );
    }

    const baseUrl =
      input.invitationUrl ??
      this.configService.get<string>('INVITATION_BASE_URL') ??
      'http://localhost:3000';

    const results: NotificationDispatchResultDto[] = [];

    for (const email of input.recipientEmails) {
      const existing = await this.prisma.invitation.findUnique({
        where: {
          quizId_recipientEmail: { quizId: quiz.id, recipientEmail: email },
        },
      });
      let invitation;
      let shouldSendEmail = true;

      if (!existing) {
        invitation = await this.prisma.invitation.create({
          data: {
            quizId: quiz.id,
            recipientEmail: email,
            status: InvitationStatus.PENDING,
          },
        });
      } else if (existing.status === InvitationStatus.CLAIMED) {
        // Already joined — don't reset, don't re-email
        invitation = existing;
        shouldSendEmail = false;
      } else if (existing.status === InvitationStatus.EXPIRED) {
        // Quiz still open (we already verified status === PUBLISHED earlier) → revive
        invitation = await this.prisma.invitation.update({
          where: { id: existing.id },
          data: { status: InvitationStatus.PENDING },
        });
      } else {
        // Already PENDING — just resend the email (no row change)
        invitation = existing;
      }

      const invitationUrl = `${baseUrl}/invitation/${input.quizId}?email=${encodeURIComponent(email)}`;
      if (shouldSendEmail) {
        const result = await this.sendQuizInvitationEmail({
          recipientEmail: email,
          quizTitle: quiz.title,
          invitationUrl,
          invitedByName,
          invitationId: invitation.id,
          correlationId: `invitation:${input.quizId}`,
          metadata: { quizId: quiz.id },
        });
        results.push(result);
      } else {
        results.push({
          deliveryLogId: '',
          status: EmailDeliveryStatus.SKIPPED,
          templateKey: NotificationTemplateKey.QUIZ_INVITATION,
          subject: `Invitation: ${quiz.title}`,
          html: '',
          text: '',
          errorMessage: 'Skipped: recipient already claimed invitation',
          providerMessageId: null,
          deliveredAt: null,
          attemptCount: 0,
        });
      }
    }

    return {
      sent: results.filter((r) => r.status === EmailDeliveryStatus.SENT).length,
      failed: results.filter((r) => r.status === EmailDeliveryStatus.FAILED)
        .length,
      results,
    };
  }

  async queueVerificationEmail(
    input: SendVerificationEmailDto,
  ): Promise<NotificationDispatchResultDto> {
    return this.sendVerificationEmail(input);
  }

  async queueQuizInvitationEmail(
    input: SendQuizInvitationEmailDto,
  ): Promise<NotificationDispatchResultDto> {
    return this.sendQuizInvitationEmail(input);
  }

  async listDeliveryLogs(
    query: ListDeliveryLogsQueryDto = {},
  ): Promise<DeliveryLogSummaryDto[]> {
    const logs = await this.prisma.emailDeliveryLog.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.templateKey ? { templateKey: query.templateKey } : {}),
        ...(query.recipientEmail
          ? { recipientEmail: query.recipientEmail }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 50,
    });

    return logs.map((log) => this.toDeliveryLogSummary(log));
  }

  async resendDeliveryLog(
    deliveryLogId: string,
  ): Promise<NotificationDispatchResultDto> {
    const deliveryLog = await this.prisma.emailDeliveryLog.findUnique({
      where: { id: deliveryLogId },
    });

    if (!deliveryLog) {
      throw new NotFoundException(
        `Email delivery log '${deliveryLogId}' not found.`,
      );
    }

    if (deliveryLog.status === EmailDeliveryStatus.SENT) {
      throw new BadRequestException(
        'Cannot resend an email that was already delivered successfully.',
      );
    }

    this.extractRenderedContent(deliveryLog.metadata);

    return this.attemptDelivery(deliveryLog.id);
  }

  async resendFailedDeliveries(
    input: ResendFailedDeliveriesDto = {},
  ): Promise<ResendBatchResultDto> {
    const failedLogs = await this.prisma.emailDeliveryLog.findMany({
      where: {
        status: EmailDeliveryStatus.FAILED,
        ...(input.templateKey ? { templateKey: input.templateKey } : {}),
      },
      orderBy: { updatedAt: 'asc' },
      take: input.limit ?? 50,
    });

    const results: NotificationDispatchResultDto[] = [];

    for (const log of failedLogs) {
      results.push(await this.attemptDelivery(log.id));
    }

    return {
      attempted: results.length,
      sent: results.filter((r) => r.status === EmailDeliveryStatus.SENT).length,
      failed: results.filter((r) => r.status === EmailDeliveryStatus.FAILED)
        .length,
      results,
    };
  }

  // -----------------------------------------------------------------------
  // Admin: delivery summary & invitation status
  // -----------------------------------------------------------------------

  async getDeliverySummary(): Promise<DeliverySummaryDto> {
    const [total, sent, failed, pending] = await Promise.all([
      this.prisma.emailDeliveryLog.count(),
      this.prisma.emailDeliveryLog.count({
        where: { status: EmailDeliveryStatus.SENT },
      }),
      this.prisma.emailDeliveryLog.count({
        where: { status: EmailDeliveryStatus.FAILED },
      }),
      this.prisma.emailDeliveryLog.count({
        where: { status: EmailDeliveryStatus.PENDING },
      }),
    ]);

    const overall: DeliveryStatusCountsDto = { total, sent, failed, pending };

    const invitations = await this.getInvitationStatus();

    return { overall, invitations };
  }

  async getInvitationStatus(): Promise<InvitationStatusDto[]> {
    // Aggregate QUIZ_INVITATION delivery logs grouped by quiz
    // Quiz identity is inferred from correlationId (invitation:<quizId>)
    // or from metadata.quizId if available.
    const logs = await this.prisma.emailDeliveryLog.findMany({
      where: { templateKey: NotificationTemplateKey.QUIZ_INVITATION },
      select: {
        id: true,
        status: true,
        correlationId: true,
        metadata: true,
      },
    });

    // Group by quiz identity
    const byQuiz = new Map<
      string,
      {
        quizId: string;
        quizTitle?: string;
        total: number;
        sent: number;
        failed: number;
        pending: number;
      }
    >();

    for (const log of logs) {
      const quizId = this.extractQuizIdFromLog(log);
      if (!quizId) continue;

      let entry = byQuiz.get(quizId);
      if (!entry) {
        entry = { quizId, total: 0, sent: 0, failed: 0, pending: 0 };
        byQuiz.set(quizId, entry);
      }

      entry.total++;
      if (log.status === EmailDeliveryStatus.SENT) entry.sent++;
      else if (log.status === EmailDeliveryStatus.FAILED) entry.failed++;
      else if (log.status === EmailDeliveryStatus.PENDING) entry.pending++;
    }

    // Enrich with quiz titles
    const quizIds = Array.from(byQuiz.keys());
    const quizzes =
      quizIds.length > 0
        ? await this.prisma.quiz.findMany({
            where: { id: { in: quizIds } },
            select: { id: true, title: true },
          })
        : [];

    const titleMap = new Map(quizzes.map((q) => [q.id, q.title]));

    return Array.from(byQuiz.values()).map((e) => ({
      quizId: e.quizId,
      quizTitle: titleMap.get(e.quizId) ?? null,
      totalInvited: e.total,
      totalSent: e.sent,
      totalFailed: e.failed,
      totalPending: e.pending,
    }));
  }

  private extractQuizIdFromLog(log: {
    correlationId?: string | null;
    metadata?: Prisma.JsonValue | null;
  }): string | null {
    // Try correlationId pattern: "invitation:<quizId>"
    if (log.correlationId?.startsWith('invitation:')) {
      return log.correlationId.slice('invitation:'.length);
    }

    // Try metadata.quizId
    if (
      log.metadata &&
      typeof log.metadata === 'object' &&
      !Array.isArray(log.metadata) &&
      'quizId' in log.metadata &&
      typeof (log.metadata as Record<string, unknown>).quizId === 'string'
    ) {
      return (log.metadata as Record<string, string>).quizId;
    }

    return null;
  }

  private async dispatchEmail(input: {
    recipientEmail: string;
    templateKey: NotificationTemplateKey;
    renderedTemplate: RenderedEmailTemplate;
    correlationId?: string;
    metadata?: Prisma.InputJsonValue;
    invitationId?: string;
  }): Promise<NotificationDispatchResultDto> {
    const deliveryLog = await this.prisma.emailDeliveryLog.create({
      data: {
        recipientEmail: input.recipientEmail,
        subject: input.renderedTemplate.subject,
        templateKey: input.templateKey,
        status: EmailDeliveryStatus.PENDING,
        attemptCount: 0,
        ...(input.correlationId ? { correlationId: input.correlationId } : {}),
        ...(input.invitationId ? { invitationId: input.invitationId } : {}),
        metadata: this.buildMetadata(input.renderedTemplate, input.metadata),
      },
    });

    return this.attemptDelivery(deliveryLog.id);
  }

  private async attemptDelivery(
    deliveryLogId: string,
  ): Promise<NotificationDispatchResultDto> {
    const deliveryLog = await this.prisma.emailDeliveryLog.findUnique({
      where: { id: deliveryLogId },
    });

    if (!deliveryLog) {
      throw new NotFoundException(
        `Email delivery log '${deliveryLogId}' not found.`,
      );
    }

    const rendered = this.extractRenderedContent(deliveryLog.metadata);
    const now = new Date();

    await this.prisma.emailDeliveryLog.update({
      where: { id: deliveryLogId },
      data: {
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        status: EmailDeliveryStatus.PENDING,
        errorMessage: null,
      },
    });

    try {
      const sendResult = await this.mailTransport.sendMail({
        to: deliveryLog.recipientEmail,
        subject: deliveryLog.subject,
        html: rendered.html,
        text: rendered.text,
      });

      const updated = await this.prisma.emailDeliveryLog.update({
        where: { id: deliveryLogId },
        data: {
          status: EmailDeliveryStatus.SENT,
          deliveredAt: now,
          providerMessageId: sendResult.messageId,
          errorMessage: null,
        },
      });

      return this.toDispatchResult(updated, rendered);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown email delivery error';

      const updated = await this.prisma.emailDeliveryLog.update({
        where: { id: deliveryLogId },
        data: {
          status: EmailDeliveryStatus.FAILED,
          errorMessage,
        },
      });

      return this.toDispatchResult(updated, rendered);
    }
  }

  private buildMetadata(
    renderedTemplate: RenderedEmailTemplate,
    metadata?: Prisma.InputJsonValue,
  ): Prisma.InputJsonValue {
    const base =
      metadata &&
      typeof metadata === 'object' &&
      metadata !== null &&
      !Array.isArray(metadata)
        ? { ...(metadata as Record<string, unknown>) }
        : {};

    return {
      ...base,
      rendered: {
        html: renderedTemplate.html,
        text: renderedTemplate.text,
      },
    };
  }

  private extractRenderedContent(
    metadata: Prisma.JsonValue | null,
  ): StoredRenderedContent {
    if (
      metadata &&
      typeof metadata === 'object' &&
      !Array.isArray(metadata) &&
      'rendered' in metadata &&
      metadata.rendered &&
      typeof metadata.rendered === 'object' &&
      !Array.isArray(metadata.rendered)
    ) {
      const rendered = metadata.rendered as Record<string, unknown>;
      if (
        typeof rendered.html === 'string' &&
        typeof rendered.text === 'string'
      ) {
        return {
          html: rendered.html,
          text: rendered.text,
        };
      }
    }

    throw new BadRequestException(
      'Delivery log is missing stored rendered email content.',
    );
  }

  private toDispatchResult(
    deliveryLog: EmailDeliveryLog,
    rendered: StoredRenderedContent,
  ): NotificationDispatchResultDto {
    return {
      deliveryLogId: deliveryLog.id,
      status: deliveryLog.status,
      templateKey: deliveryLog.templateKey,
      subject: deliveryLog.subject,
      html: rendered.html,
      text: rendered.text,
      errorMessage: deliveryLog.errorMessage,
      providerMessageId: deliveryLog.providerMessageId,
      deliveredAt: deliveryLog.deliveredAt,
      attemptCount: deliveryLog.attemptCount,
    };
  }

  private toDeliveryLogSummary(
    deliveryLog: EmailDeliveryLog,
  ): DeliveryLogSummaryDto {
    return {
      id: deliveryLog.id,
      recipientEmail: deliveryLog.recipientEmail,
      subject: deliveryLog.subject,
      templateKey: deliveryLog.templateKey,
      status: deliveryLog.status,
      correlationId: deliveryLog.correlationId,
      errorMessage: deliveryLog.errorMessage,
      attemptCount: deliveryLog.attemptCount,
      providerMessageId: deliveryLog.providerMessageId,
      lastAttemptAt: deliveryLog.lastAttemptAt,
      deliveredAt: deliveryLog.deliveredAt,
      createdAt: deliveryLog.createdAt,
      updatedAt: deliveryLog.updatedAt,
    };
  }
}
