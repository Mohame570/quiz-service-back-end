import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { FollowUpService } from '../services/follow-up.service';
import { FollowUpSummaryDto } from '../dto/follow-up.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.gaurd';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../../generated/prisma/client';

// Admin-only: the follow-up queue surfaces per-student names, scores,
// and grading state, same sensitivity as the analytics endpoints it's
// built on. Implements docs/analytics-contract.md §15.
@Controller('follow-up')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class FollowUpController {
  constructor(private readonly followUpService: FollowUpService) {}

  @Get()
  async getFollowUpQueue(): Promise<FollowUpSummaryDto> {
    return this.followUpService.getFollowUpQueue();
  }

  @Get('quizzes/:quizId')
  async getFollowUpQueueForQuiz(@Param('quizId') quizId: string): Promise<FollowUpSummaryDto> {
    return this.followUpService.getFollowUpQueueForQuiz(quizId);
  }
}
