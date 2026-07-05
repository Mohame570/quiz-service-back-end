// src/modules/notifications/controllers/notifications-admin.controller.ts
//
// Admin-facing endpoints for email delivery monitoring & invitations.
// - GET  /api/admin/notifications/delivery-summary  → aggregated stats
// - GET  /api/admin/notifications/invitation-status  → per-quiz invitation breakdown
// - POST /api/admin/notifications/send-invitation    → send invitation emails
//
// Requires a valid admin JWT.

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { NotificationService } from '../services/notification.service';
import {
  DeliverySummaryDto,
  InvitationStatusDto,
} from '../dto/delivery-summary.dto';
import { SendQuizInvitationAdminDto } from '../dto/send-quiz-invitation-admin.dto';
import { NotificationDispatchResultDto } from '../dto/notification-dispatch-result.dto';

@Controller('admin/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsAdminController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * GET /api/admin/notifications/delivery-summary
   *
   * Returns aggregated counts (total / sent / failed / pending)
   * across all delivery logs, plus a per-quiz invitation breakdown.
   */
  @Get('delivery-summary')
  async getDeliverySummary(@Request() req: any): Promise<DeliverySummaryDto> {
    this.assertAdmin(req);
    return this.notificationService.getDeliverySummary();
  }

  /**
   * GET /api/admin/notifications/invitation-status
   *
   * Returns invitation delivery status grouped by quiz.
   */
  @Get('invitation-status')
  async getInvitationStatus(
    @Request() req: any,
  ): Promise<InvitationStatusDto[]> {
    this.assertAdmin(req);
    return this.notificationService.getInvitationStatus();
  }

  /**
   * POST /api/admin/notifications/send-invitation
   *
   * Send quiz invitation emails to one or more students.
   */
  @Post('send-invitation')
  async sendInvitation(
    @Body() dto: SendQuizInvitationAdminDto,
    @Request() req: any,
  ): Promise<{ sent: number; failed: number; results: NotificationDispatchResultDto[] }> {
    this.assertAdmin(req);
    return this.notificationService.sendQuizInvitationToStudents(
      dto,
      req.user?.name,
    );
  }

  private assertAdmin(req: any): void {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required.');
    }
  }
}
