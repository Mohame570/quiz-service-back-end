import { Prisma, CheatingEventType } from '../../../generated/prisma/client';

export interface RecordCheatingEventDto {
  attemptId: string;
  eventType: CheatingEventType;
  description?: string;
  occurredAt?: Date;
  metadata?: Prisma.InputJsonValue;
}
