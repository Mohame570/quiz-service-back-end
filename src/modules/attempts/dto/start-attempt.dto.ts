// src/modules/attempts/dto/start-attempt.dto.ts

import { IsNotEmpty, IsString } from 'class-validator';

export class StartAttemptDto {
  @IsString()
  @IsNotEmpty({ message: 'quizId must be a non-empty string.' })
  quizId!: string;
}
