import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AttemptsModule } from '../attempts/attempts.module';
import { AnalyticsController } from './controllers/analytics.controller';
import { AnalyticsGradingController } from './controllers/analytics-grading.controller';
import { AnalyticsService } from './services/analytics.service';
import { AnalyticsGradingService } from './services/analytics-grading.service';
import { RolesGuard } from '../auth/guards/roles.gaurd';

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
  controllers: [AnalyticsController, AnalyticsGradingController],
  providers: [AnalyticsService, AnalyticsGradingService, RolesGuard],
})
export class AnalyticsModule {}