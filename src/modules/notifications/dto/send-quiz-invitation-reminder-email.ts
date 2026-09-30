import { NotificationRequestMetadata } from './notification-request-metadata.dto';

export interface SendQuizReminderEmailDto extends NotificationRequestMetadata {
  recipientEmail: string;
  recipientName?: string;
  quizTitle: string;
  invitationUrl: string;
  availableUntil?: Date;
  invitationId?: string;
}
