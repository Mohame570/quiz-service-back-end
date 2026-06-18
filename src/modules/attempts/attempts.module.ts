// src/modules/attempts/attempts.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AttemptsController } from './controllers/attempts.controller';
import { AttemptsService } from './services/attempts.service';
import { ScoringService } from './services/scoring.service';
@Module({
  imports: [PrismaModule],
  controllers: [AttemptsController],
  providers: [AttemptsService, ScoringService],
  // Export both so L6 Analytics can inject either if needed.
  exports: [AttemptsService, ScoringService],
})
export class AttemptsModule {}
