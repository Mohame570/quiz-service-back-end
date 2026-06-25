// src/modules/integrity/integrity.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { IntegrityController } from './controllers/integrity.controller';
import { IntegrityAdminController } from './controllers/integrity-admin.controller';
import { IntegrityService } from './services/integrity.service';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
      }),
    }),
    AuthModule,
  ],
  controllers: [IntegrityController, IntegrityAdminController],
  providers: [IntegrityService],
  exports: [IntegrityService],
})
export class IntegrityModule {}
