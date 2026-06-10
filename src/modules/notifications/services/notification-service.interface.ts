import { NotificationDispatchResultDto } from '../dto/notification-dispatch-result.dto';
import { SendQuizInvitationEmailDto } from '../dto/send-quiz-invitation-email.dto';
import { SendVerificationEmailDto } from '../dto/send-verification-email.dto';

export const NOTIFICATION_SERVICE = Symbol('NOTIFICATION_SERVICE');

export interface NotificationServiceInterface {
  queueVerificationEmail(
    input: SendVerificationEmailDto,
  ): Promise<NotificationDispatchResultDto>;
  queueQuizInvitationEmail(
    input: SendQuizInvitationEmailDto,
  ): Promise<NotificationDispatchResultDto>;
}
