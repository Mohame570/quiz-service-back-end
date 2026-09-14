import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { FollowUpController } from './controllers/follow-up.controller';
import { FollowUpService } from './services/follow-up.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AnalyticsModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
      }),
    }),
  ],
  controllers: [FollowUpController],
  providers: [FollowUpService],
})
export class FollowUpModule {}
