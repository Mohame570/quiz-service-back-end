import {
  Controller,
  Get,
  Param,
  Sse,
  MessageEvent,
  UseGuards,
} from '@nestjs/common';
import { AnalyticsService } from '../services/analytics.service';
import { DashboardSummaryDto } from '../dto/dashboard-summary.dto';
import { QuizAttemptsResponseDto } from '../dto/quiz-attempts-response.dto';
import { analyticsEvents$ } from '../analytics.events';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.gaurd';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../../generated/prisma/client';

// Admin-only: analytics summaries and per-quiz attempt data are not
// safe to expose to unauthenticated or non-admin callers. JwtAuthGuard
// verifies the token and attaches req.user; RolesGuard then checks
// req.user.role against @Roles(UserRole.ADMIN).
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  async getAnalytics(): Promise<DashboardSummaryDto> {
    return this.analyticsService.getAnalytics();
  }

  @Get('quizzes/:quizTitle/attempts')
  async getQuizAttempts(
    @Param('quizTitle') quizTitle: string,
  ): Promise<QuizAttemptsResponseDto> {
    return this.analyticsService.getQuizAttempts(quizTitle);
  }

  @Sse('events')
  stream(): Observable<MessageEvent> {
    return analyticsEvents$.pipe(map((payload) => ({ data: payload })));
  }
}