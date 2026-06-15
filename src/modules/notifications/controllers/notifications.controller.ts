import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import {
  DeliveryLogSummaryDto,
  ListDeliveryLogsQueryDto,
  NotificationDispatchResultDto,
  ResendBatchResultDto,
  ResendFailedDeliveriesDto,
} from '../dto';
import { NotificationService } from '../services/notification.service';

@Controller('notifications/delivery-logs')
export class NotificationsController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * GET /api/notifications/delivery-logs
   * List delivery logs for operations / debugging.
   */
  @Get()
  listDeliveryLogs(
    @Query() query: ListDeliveryLogsQueryDto,
  ): Promise<DeliveryLogSummaryDto[]> {
    return this.notificationService.listDeliveryLogs(query);
  }

  /**
   * POST /api/notifications/delivery-logs/resend-failed
   * Retry all FAILED deliveries (optionally filtered by template).
   */
  @Post('resend-failed')
  resendFailedDeliveries(
    @Body() body: ResendFailedDeliveriesDto,
  ): Promise<ResendBatchResultDto> {
    return this.notificationService.resendFailedDeliveries(body);
  }

  /**
   * POST /api/notifications/delivery-logs/:id/resend
   * Retry a single failed or pending delivery log.
   */
  @Post(':id/resend')
  resendDeliveryLog(
    @Param('id') id: string,
  ): Promise<NotificationDispatchResultDto> {
    return this.notificationService.resendDeliveryLog(id);
  }
}
