import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import configuration from './common/config/configuration';
import { envValidationSchema } from './common/config/env.validation';
import { PrismaModule } from './common/prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { QuizModule } from './modules/quiz/quiz.module';
import { AttemptsModule } from './modules/attempts/attempts.module';
import { IntegrityModule } from './modules/integrity/integrity.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { QuestionsModule } from './modules/questions/questions.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { StudentModule } from './modules/student/student.module';
import { UsersModule } from './modules/users/users.module';
import { SettingsModule } from './modules/settings/settings.module';

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
    AuthModule,
    QuizModule,
    AttemptsModule,
    NotificationsModule,
    IntegrityModule,
    QuestionsModule,
    AnalyticsModule,
    StudentModule,
    UsersModule,
    SettingsModule,
  ],
})
export class AppModule {}
