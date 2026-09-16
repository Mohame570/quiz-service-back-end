import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SettingsController, SettingsPublicController } from './controllers/settings.controller';
import { SettingsService } from './services/settings.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SettingsController, SettingsPublicController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
