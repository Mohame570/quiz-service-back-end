import { Prisma } from '../../../generated/prisma/client';

export interface NotificationRequestMetadata {
  correlationId?: string;
  metadata?: Prisma.InputJsonValue;
}
