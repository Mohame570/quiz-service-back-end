import {
  EmailDeliveryStatus,
  NotificationTemplateKey,
} from '../../../generated/prisma/client';

export interface NotificationDispatchResultDto {
  deliveryLogId: string;
  status: EmailDeliveryStatus;
  templateKey: NotificationTemplateKey;
  subject: string;
  html: string;
  text: string;
  errorMessage?: string | null;
  providerMessageId?: string | null;
  deliveredAt?: Date | null;
  attemptCount: number;
}
