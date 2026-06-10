import { Injectable } from '@nestjs/common';

import {
  EmailDeliveryStatus,
  NotificationTemplateKey,
  Prisma,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotificationDispatchResultDto } from '../dto/notification-dispatch-result.dto';
import { SendQuizInvitationEmailDto } from '../dto/send-quiz-invitation-email.dto';
import { SendVerificationEmailDto } from '../dto/send-verification-email.dto';
import {
  NotificationServiceInterface,
} from './notification-service.interface';
import { renderQuizInvitationEmailTemplate } from '../templates/quiz-invitation-email.template';
import { RenderedEmailTemplate } from '../templates/template.types';
import { renderVerificationEmailTemplate } from '../templates/verification-email.template';

@Injectable()
export class NotificationService implements NotificationServiceInterface {
  constructor(private readonly prisma: PrismaService) {}

  async queueVerificationEmail(
    input: SendVerificationEmailDto,
  ): Promise<NotificationDispatchResultDto> {
    const renderedTemplate = renderVerificationEmailTemplate(input);

    return this.createQueuedDeliveryLog({
      recipientEmail: input.recipientEmail,
      templateKey: NotificationTemplateKey.VERIFICATION,
      renderedTemplate,
      correlationId: input.correlationId,
      metadata: input.metadata,
    });
  }

  async queueQuizInvitationEmail(
    input: SendQuizInvitationEmailDto,
  ): Promise<NotificationDispatchResultDto> {
    const renderedTemplate = renderQuizInvitationEmailTemplate(input);

    return this.createQueuedDeliveryLog({
      recipientEmail: input.recipientEmail,
      templateKey: NotificationTemplateKey.QUIZ_INVITATION,
      renderedTemplate,
      correlationId: input.correlationId,
      metadata: input.metadata,
    });
  }

  private async createQueuedDeliveryLog(input: {
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
        ...(input.correlationId ? { correlationId: input.correlationId } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      },
    });

    return {
      deliveryLogId: deliveryLog.id,
      status: deliveryLog.status,
      templateKey: deliveryLog.templateKey,
      subject: input.renderedTemplate.subject,
      html: input.renderedTemplate.html,
      text: input.renderedTemplate.text,
    };
  }
}
