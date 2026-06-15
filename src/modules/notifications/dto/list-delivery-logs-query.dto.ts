import { Type } from 'class-transformer';
import { IsEmail, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  EmailDeliveryStatus,
  NotificationTemplateKey,
} from '../../../generated/prisma/client';

export class ListDeliveryLogsQueryDto {
  @IsOptional()
  @IsEnum(EmailDeliveryStatus)
  status?: EmailDeliveryStatus;

  @IsOptional()
  @IsEnum(NotificationTemplateKey)
  templateKey?: NotificationTemplateKey;

  @IsOptional()
  @IsEmail()
  recipientEmail?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
