import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import configuration from './common/config/configuration';
import { envValidationSchema } from './common/config/env.validation';
import { PrismaModule } from './common/prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    PrismaModule,
    HealthModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
