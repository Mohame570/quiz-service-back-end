import { NotificationRequestMetadata } from './notification-request-metadata.dto';

export interface SendPasswordResetEmailDto extends NotificationRequestMetadata {
  recipientEmail: string;
  recipientName?: string;
  resetUrl: string;
  expiresInMinutes?: number;
}
