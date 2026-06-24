// src/modules/integrity/controllers/integrity-admin.controller.ts
//
// Admin-facing endpoints for integrity monitoring.
// - GET /api/admin/integrity/suspicious  → flagged attempts above threshold
// - GET /api/admin/integrity/attempts/:id/events  → all events for one attempt
//
// Requires a valid admin JWT.

import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { IntegrityService } from '../services/integrity.service';
import { SuspiciousAttemptsQueryDto } from '../dto/suspicious-attempts-query.dto';
import { SuspiciousAttemptDto, CheatingEventSummaryDto } from '../dto/suspicious-attempt.dto';

@Controller('admin/integrity')
@UseGuards(JwtAuthGuard)
export class IntegrityAdminController {
  constructor(private readonly integrityService: IntegrityService) {}

  /**
   * GET /api/admin/integrity/suspicious
   *
   * Returns attempts that exceed the cheating-event threshold.
   * Query params:
   *   threshold  — min event count to flag (default 3)
   *   quizId     — optional quiz filter
   *
   * Flag rule: an attempt is flagged when its cheating-event count
   * is >= threshold. Results are ordered by event count descending.
   */
  @Get('suspicious')
  async getSuspiciousAttempts(
    @Request() req: any,
    @Query() query: SuspiciousAttemptsQueryDto,
  ): Promise<SuspiciousAttemptDto[]> {
    this.assertAdmin(req);

    return this.integrityService.getSuspiciousAttempts(
      query.threshold ?? 3,
      query.quizId,
    );
  }

  /**
   * GET /api/admin/integrity/attempts/:attemptId/events
   *
   * Returns all cheating events for a single attempt, most recent first.
   */
  @Get('attempts/:attemptId/events')
  async getAttemptEvents(
    @Request() req: any,
    @Param('attemptId') attemptId: string,
  ): Promise<CheatingEventSummaryDto[]> {
    this.assertAdmin(req);

    return this.integrityService.getEventsForAttempt(attemptId);
  }

  private assertAdmin(req: any): void {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required.');
    }
  }
}
