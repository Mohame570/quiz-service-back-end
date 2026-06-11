// src/modules/attempts/dto/save-answers.dto.ts

import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class SaveAnswerItemDto {
  @IsUUID(4, { message: 'questionId must be a valid UUID v4.' })
  questionId!: string;

  /// null / omitted means the student skipped this question.
  @IsOptional()
  @IsUUID(4, { message: 'selectedOptionId must be a valid UUID v4.' })
  selectedOptionId?: string | null;
}

export class SaveAnswersDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'answers array must not be empty.' })
  @ValidateNested({ each: true })
  @Type(() => SaveAnswerItemDto)
  answers!: SaveAnswerItemDto[];
}
