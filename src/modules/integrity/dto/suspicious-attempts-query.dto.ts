// src/modules/integrity/dto/suspicious-attempts-query.dto.ts

import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class SuspiciousAttemptsQueryDto {
  /// Minimum number of cheating events before an attempt is flagged
  /// as suspicious. Default: 3.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  threshold?: number;

  /// Optional filter by quiz ID.
  @IsOptional()
  quizId?: string;
}
