// src/modules/attempts/dto/save-answers.dto.ts

import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class SaveAnswerItemDto {
  @IsString()
  @IsNotEmpty({ message: 'questionId must be a non-empty string.' })
  questionId!: string;

  /// null / omitted means the student skipped this question.
  @IsOptional()
  @IsString()
  selectedOptionId?: string | null;

  /// Free-text response for SHORT_TEXT and ESSAY questions.
  @IsOptional()
  @IsString()
  textAnswer?: string | null;
}

export class SaveAnswersDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'answers array must not be empty.' })
  @ValidateNested({ each: true })
  @Type(() => SaveAnswerItemDto)
  answers!: SaveAnswerItemDto[];
}
