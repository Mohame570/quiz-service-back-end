import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ScoringService } from './scoring.service';
import { AttemptStatus } from '../../../generated/prisma/enums';

@Injectable()
export class AttemptExpirationService {
  private readonly logger = new Logger(AttemptExpirationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringService: ScoringService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async finalizeExpiredAttempts() {
    // get all attempts from the db that are in-progress and the time is expired
    const expiredAttempts = await this.prisma.attempt.findMany({
      where: {
        status: AttemptStatus.IN_PROGRESS,
        expiresAt: { lte: new Date() },
      },
    });

    if (expiredAttempts.length === 0) return;

    for (const expiredAttempt of expiredAttempts) {
      try {
        // update the status first thing
        const result = await this.scoringService.finalizeExpiredAttempt(
          expiredAttempt.id,
        );

        if (!result) {
          this.logger.log(
            `Attempt ${expiredAttempt.id} was already finalized elsewhere — skipped.`,
          );
          continue;
        }
        this.logger.log(
          `Attempt ${expiredAttempt.id} has successfully finalized.`,
        );
      } catch (e) {
        this.logger.error(
          `Failed to finalize this attempt ${expiredAttempt.id}`,
          e,
        );
      }
    }
  }
}
