import { Module } from '@nestjs/common';
import { IntegrityController } from './controllers/integrity.controller';
import { IntegrityService } from './services/integrity.service';

@Module({
  controllers: [IntegrityController],
  providers: [IntegrityService],
  exports: [IntegrityService],
})
export class IntegrityModule {}
