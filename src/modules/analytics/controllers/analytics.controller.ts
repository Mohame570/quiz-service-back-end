import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { AnalyticsService } from '../services/analytics.service';
import { DashboardSummaryDto } from '../dto/dashboard-summary.dto';
import { QuizAttemptsResponseDto } from '../dto/quiz-attempts-response.dto';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  async getAnalytics(): Promise<DashboardSummaryDto> {
    return this.analyticsService.getAnalytics();
  }

  @Get('quizzes/:quizId/attempts')
  async getQuizAttempts(
    @Param('quizId', ParseIntPipe) quizId: number,
  ): Promise<QuizAttemptsResponseDto> {
    return this.analyticsService.getQuizAttempts(quizId);
  }
}

