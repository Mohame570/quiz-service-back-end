import { NotificationRequestMetadata } from './notification-request-metadata.dto';

export interface SendQuizInvitationEmailDto extends NotificationRequestMetadata {
  recipientEmail: string;
  recipientName?: string;
  quizTitle: string;
  invitationUrl: string;
  invitedByName?: string;
  availableUntil?: Date;
}
