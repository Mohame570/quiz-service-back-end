import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AttemptResponseDto } from '../../attempts/dto/attempt-response.dto';
import { GradeEssayAnswerDto, GradingQueueQueryDto } from '../dto/grading.dto';
import {
  GradingAttemptDetailDto,
  GradingQueueResponseDto,
} from '../dto/grading-response.dto';
import { AnalyticsGradingService } from '../services/analytics-grading.service';

@Controller('admin/analytics/grading')
@UseGuards(JwtAuthGuard)
export class AnalyticsGradingController {
  constructor(private readonly gradingService: AnalyticsGradingService) {}

  @Get('queue')
  async getQueue(
    @Request() req: any,
    @Query() query: GradingQueueQueryDto,
  ): Promise<GradingQueueResponseDto> {
    this.assertAdmin(req);
    return this.gradingService.getGradingQueue(query.quizId);
  }

  @Get('attempts/:attemptId')
  async getAttempt(
    @Request() req: any,
    @Param('attemptId') attemptId: string,
  ): Promise<GradingAttemptDetailDto> {
    this.assertAdmin(req);
    return this.gradingService.getGradingAttempt(attemptId);
  }

  @Patch('attempts/:attemptId/answers/:answerId')
  async gradeEssayAnswer(
    @Request() req: any,
    @Param('attemptId') attemptId: string,
    @Param('answerId') answerId: string,
    @Body() dto: GradeEssayAnswerDto,
  ): Promise<AttemptResponseDto> {
    this.assertAdmin(req);
    return this.gradingService.gradeEssayAnswer(
      attemptId,
      answerId,
      dto.pointsEarned,
      req.user.sub,
    );
  }

  private assertAdmin(req: any): void {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required.');
    }
  }
}
