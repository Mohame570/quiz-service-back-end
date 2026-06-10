// src/modules/attempts/dto/start-attempt.dto.ts

import { IsUUID } from 'class-validator';

export class StartAttemptDto {
  @IsUUID(4, { message: 'quizId must be a valid UUID v4.' })
  quizId!: string;
}
