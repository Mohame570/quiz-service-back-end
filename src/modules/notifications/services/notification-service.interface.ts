import { DeliveryLogSummaryDto } from '../dto/delivery-log-summary.dto';
import { NotificationDispatchResultDto } from '../dto/notification-dispatch-result.dto';
import { ResendBatchResultDto } from '../dto/resend-batch-result.dto';
import { ResendFailedDeliveriesDto } from '../dto/resend-failed-deliveries.dto';
import { SendQuizInvitationEmailDto } from '../dto/send-quiz-invitation-email.dto';
import { SendVerificationEmailDto } from '../dto/send-verification-email.dto';
import { ListDeliveryLogsQueryDto } from '../dto/list-delivery-logs-query.dto';

export const NOTIFICATION_SERVICE = Symbol('NOTIFICATION_SERVICE');

export interface NotificationServiceInterface {
  sendVerificationEmail(
    input: SendVerificationEmailDto,
  ): Promise<NotificationDispatchResultDto>;

  sendQuizInvitationEmail(
    input: SendQuizInvitationEmailDto,
  ): Promise<NotificationDispatchResultDto>;

  /** @deprecated Use sendVerificationEmail — kept for Sprint 1 callers */
  queueVerificationEmail(
    input: SendVerificationEmailDto,
  ): Promise<NotificationDispatchResultDto>;

  /** @deprecated Use sendQuizInvitationEmail — kept for Sprint 1 callers */
  queueQuizInvitationEmail(
    input: SendQuizInvitationEmailDto,
  ): Promise<NotificationDispatchResultDto>;

  listDeliveryLogs(
    query?: ListDeliveryLogsQueryDto,
  ): Promise<DeliveryLogSummaryDto[]>;

  resendDeliveryLog(
    deliveryLogId: string,
  ): Promise<NotificationDispatchResultDto>;

  resendFailedDeliveries(
    input?: ResendFailedDeliveriesDto,
  ): Promise<ResendBatchResultDto>;
}
