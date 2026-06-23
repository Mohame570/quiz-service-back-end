import { Controller, Get, Param, Sse, MessageEvent } from '@nestjs/common';
import { AnalyticsService } from '../services/analytics.service';
import { DashboardSummaryDto } from '../dto/dashboard-summary.dto';
import { QuizAttemptsResponseDto } from '../dto/quiz-attempts-response.dto';
import { analyticsEvents$ } from '../analytics.events';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';

@Controller('analytics')
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

