import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AttemptsModule } from '../attempts/attempts.module';
import { AnalyticsController } from './controllers/analytics.controller';
import { AnalyticsGradingController } from './controllers/analytics-grading.controller';
import { QuestionQualityController } from './controllers/question-quality.controller';
import { CohortDistributionController } from './controllers/cohort-distribution.controller';
import { AnalyticsService } from './services/analytics.service';
import { AnalyticsGradingService } from './services/analytics-grading.service';
import { QuestionQualityService } from './services/question-quality.service';
import { CohortDistributionService } from './services/cohort-distribution.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AttemptsModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
      }),
    }),
  ],
  controllers: [
    AnalyticsController,
    AnalyticsGradingController,
    QuestionQualityController,
    CohortDistributionController,
  ],
  providers: [AnalyticsService, AnalyticsGradingService, QuestionQualityService, CohortDistributionService],
  // Exported so FollowUpModule can reuse getStudentQuizMetrics() rather
  // than re-deriving the §6 status logic independently.
  exports: [AnalyticsService],
})
export class AnalyticsModule {}