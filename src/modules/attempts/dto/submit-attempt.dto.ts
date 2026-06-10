// src/modules/attempts/dto/submit-attempt.dto.ts

import { Type } from 'class-transformer';
import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { SaveAnswerItemDto } from './save-answers.dto';

export class SubmitAttemptDto {
  /// Optional bulk answer write sent together with the submit call.
  /// Answers may also have been saved incrementally via PATCH /answers.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveAnswerItemDto)
  answers?: SaveAnswerItemDto[];
}
