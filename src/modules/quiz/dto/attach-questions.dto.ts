import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsNotEmpty,
  Min,
  ValidateNested,
} from 'class-validator';

export class AttachQuestionItemDto {
  @IsString()
  @IsNotEmpty()
  questionId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class AttachQuestionsDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'questions array must not be empty.' })
  @ArrayUnique((item: AttachQuestionItemDto) => item.questionId, {
    message: 'questionId must not be duplicated in a single request.',
  })
  @ValidateNested({ each: true })
  @Type(() => AttachQuestionItemDto)
  questions!: AttachQuestionItemDto[];
}
