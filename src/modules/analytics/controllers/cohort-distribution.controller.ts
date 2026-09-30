import { BadRequestException, Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { CohortDistributionService } from '../services/cohort-distribution.service';
import { CohortDistributionDto } from '../dto/cohort-distribution.dto';
import { AnalyticsFilterQuery, parseAnalyticsFilter } from '../dto/analytics-filter.dto';
import { toCsv } from '../utils/csv.util';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.gaurd';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../../generated/prisma/client';

@Controller('analytics/cohorts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class CohortDistributionController {
  constructor(private readonly cohortDistributionService: CohortDistributionService) {}

  @Get('distribution')
  async getDistribution(@Query() query: AnalyticsFilterQuery): Promise<CohortDistributionDto> {
    const filter = this.parseOrThrow(query);
    return this.cohortDistributionService.getDistribution(filter);
  }

  /**
   * Exports exactly the rows getDistribution() would show for the same
   * filter — same service method, same underlying query — so the export
   * can never contain a row the admin didn't also see on screen.
   *
   * Column set is a hard-coded, explicit allowlist: studentId, name,
   * cohort, quiz, score fields, rank/percentile, submittedAt. Nothing
   * from User (email, passwordHash, verificationToken) or any auth/token
   * field is ever selected by the underlying query in the first place —
   * see CohortDistributionService.getFilteredStandingRows's `select`.
   */
  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="cohort-standings.csv"')
  async exportCsv(@Query() query: AnalyticsFilterQuery): Promise<string> {
    const filter = this.parseOrThrow(query);
    const standings = await this.cohortDistributionService.getStandingsForExport(filter);

    return toCsv(
      [
        'studentId',
        'studentName',
        'cohort',
        'quizId',
        'quizTitle',
        'score',
        'maxScore',
        'percentage',
        'rank',
        'percentile',
        'submittedAt',
      ],
      standings.map((s) => [
        s.studentId,
        s.studentName,
        s.cohort ?? '',
        s.quizId,
        s.quizTitle,
        s.score,
        s.maxScore,
        s.percentage,
        s.rank,
        s.percentile,
        s.submittedAt.toISOString(),
      ]),
    );
  }

  private parseOrThrow(query: AnalyticsFilterQuery) {
    try {
      return parseAnalyticsFilter(query);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid filter');
    }
  }
}
