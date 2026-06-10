import { NotificationRequestMetadata } from './notification-request-metadata.dto';

export interface SendVerificationEmailDto extends NotificationRequestMetadata {
  recipientEmail: string;
  recipientName?: string;
  verificationUrl: string;
  expiresInHours?: number;
}
