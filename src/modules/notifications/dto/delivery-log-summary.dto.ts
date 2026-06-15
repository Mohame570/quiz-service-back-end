import {
  EmailDeliveryStatus,
  NotificationTemplateKey,
} from '../../../generated/prisma/client';

export interface DeliveryLogSummaryDto {
  id: string;
  recipientEmail: string;
  subject: string;
  templateKey: NotificationTemplateKey;
  status: EmailDeliveryStatus;
  correlationId: string | null;
  errorMessage: string | null;
  attemptCount: number;
  providerMessageId: string | null;
  lastAttemptAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
