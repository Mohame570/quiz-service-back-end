import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { NotificationTemplateKey } from '../../../generated/prisma/client';

export class ResendFailedDeliveriesDto {
  @IsOptional()
  @IsEnum(NotificationTemplateKey)
  templateKey?: NotificationTemplateKey;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
