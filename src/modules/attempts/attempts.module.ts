// src/modules/attempts/attempts.module.ts

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AttemptsController } from './controllers/attempts.controller';
import { AttemptsService } from './services/attempts.service';

@Module({
  imports: [PrismaModule],
  controllers: [AttemptsController],
  providers: [AttemptsService],
  // Export the service so L6 Analytics can inject it if needed.
  exports: [AttemptsService],
})
export class AttemptsModule {}
