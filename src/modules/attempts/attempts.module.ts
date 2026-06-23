// src/modules/attempts/attempts.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

import { AttemptsController } from './controllers/attempts.controller';
import { ResultsController } from './controllers/results.controller';

import { AttemptsService } from './services/attempts.service';
import { ScoringService } from './services/scoring.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
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
    AttemptsController,
    ResultsController,
  ],
  providers: [
    AttemptsService,
    ScoringService,
  ],
  exports: [
    AttemptsService,
    ScoringService,
  ],
})
export class AttemptsModule {}