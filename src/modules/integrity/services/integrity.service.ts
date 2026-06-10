import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { RecordCheatingEventDto } from '../dto/record-cheating-event.dto';

@Injectable()
export class IntegrityService {
  constructor(private readonly prisma: PrismaService) {}

  async recordCheatingEvent(input: RecordCheatingEventDto) {
    return this.prisma.cheatingEventLog.create({
      data: {
        attemptId: input.attemptId,
        eventType: input.eventType,
        ...(input.description ? { description: input.description } : {}),
        ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      },
    });
  }
}
