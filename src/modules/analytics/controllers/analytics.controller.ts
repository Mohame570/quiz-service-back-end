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
import { QuizMetricSummaryDto, StudentQuizMetricDto, DashboardMetricsDto } from '../dto/quiz-metric.dto';
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

  // Implements the Sprint 2 brief — live, org-wide dashboard metrics
  // (participation/completion/absence/follow-up/score distribution)
  // aggregated across every quiz. Declared before the /quizzes/:quizId/*
  // routes only as a readability convention; NestJS route matching
  // isn't order-sensitive here since the paths don't overlap.
  @Get('dashboard')
  async getDashboardMetrics(): Promise<DashboardMetricsDto> {
    return this.analyticsService.getDashboardMetrics();
  }

  @Get('quizzes/:quizTitle/attempts')
  async getQuizAttempts(
    @Param('quizTitle') quizTitle: string,
  ): Promise<QuizAttemptsResponseDto> {
    return this.analyticsService.getQuizAttempts(quizTitle);
  }

  // Implements docs/analytics-contract.md §7 — assignment-anchored
  // quiz-level metric summary (participation, completion, absence,
  // follow-up), distinct from the older /attempts endpoint above.
  @Get('quizzes/:quizId/metrics')
  async getQuizMetricSummary(
    @Param('quizId') quizId: string,
  ): Promise<QuizMetricSummaryDto> {
    return this.analyticsService.getQuizMetricSummary(quizId);
  }

  // Implements docs/analytics-contract.md §6 — per-student status,
  // correctly distinguishing ABSENT from NOT_STARTED per §4.
  @Get('quizzes/:quizId/student-metrics')
  async getStudentQuizMetrics(
    @Param('quizId') quizId: string,
  ): Promise<StudentQuizMetricDto[]> {
    return this.analyticsService.getStudentQuizMetrics(quizId);
  }

  @Sse('events')
  stream(): Observable<MessageEvent> {
    return analyticsEvents$.pipe(map((payload) => ({ data: payload })));
  }
}