import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { QuestionQualityService } from '../services/question-quality.service';
import { QuestionQualitySummaryDto } from '../dto/question-quality.dto';
import { AnalyticsFilterQuery, parseAnalyticsFilter } from '../dto/analytics-filter.dto';
import { RolesGuard } from '../../auth/guards/roles.gaurd';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../../generated/prisma/client';

@Controller('analytics/questions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class QuestionQualityController {
  constructor(private readonly questionQualityService: QuestionQualityService) {}

  @Get('quality')
  async getQuestionQuality(@Query() query: AnalyticsFilterQuery): Promise<QuestionQualitySummaryDto> {
    try {
      const filter = parseAnalyticsFilter(query);
      return await this.questionQualityService.getQuestionQuality(filter);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid filter');
    }
  }
}
