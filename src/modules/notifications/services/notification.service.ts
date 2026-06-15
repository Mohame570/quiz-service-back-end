import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  EmailDeliveryLog,
  EmailDeliveryStatus,
  NotificationTemplateKey,
  Prisma,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DeliveryLogSummaryDto } from '../dto/delivery-log-summary.dto';
import { ListDeliveryLogsQueryDto } from '../dto/list-delivery-logs-query.dto';
import { NotificationDispatchResultDto } from '../dto/notification-dispatch-result.dto';
import { ResendBatchResultDto } from '../dto/resend-batch-result.dto';
import { ResendFailedDeliveriesDto } from '../dto/resend-failed-deliveries.dto';
import { SendQuizInvitationEmailDto } from '../dto/send-quiz-invitation-email.dto';
import { SendVerificationEmailDto } from '../dto/send-verification-email.dto';
import { renderQuizInvitationEmailTemplate } from '../templates/quiz-invitation-email.template';
import { RenderedEmailTemplate } from '../templates/template.types';
import { renderVerificationEmailTemplate } from '../templates/verification-email.template';
import {
  NotificationServiceInterface,
} from './notification-service.interface';
import { MailTransportService } from './mail-transport.service';

interface StoredRenderedContent {
  html: string;
  text: string;
}

@Injectable()
export class NotificationService implements NotificationServiceInterface {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailTransport: MailTransportService,
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
    });
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

  private async dispatchEmail(input: {
    recipientEmail: string;
    templateKey: NotificationTemplateKey;
    renderedTemplate: RenderedEmailTemplate;
    correlationId?: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<NotificationDispatchResultDto> {
    const deliveryLog = await this.prisma.emailDeliveryLog.create({
      data: {
        recipientEmail: input.recipientEmail,
        subject: input.renderedTemplate.subject,
        templateKey: input.templateKey,
        status: EmailDeliveryStatus.PENDING,
        attemptCount: 0,
        ...(input.correlationId ? { correlationId: input.correlationId } : {}),
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
