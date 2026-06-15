import { NotificationDispatchResultDto } from './notification-dispatch-result.dto';

export interface ResendBatchResultDto {
  attempted: number;
  sent: number;
  failed: number;
  results: NotificationDispatchResultDto[];
}
