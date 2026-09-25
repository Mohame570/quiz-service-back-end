import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  organizationName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  timezoneLabel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  defaultPassThreshold?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  defaultDurationMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  integrityReviewThreshold?: number;
}
