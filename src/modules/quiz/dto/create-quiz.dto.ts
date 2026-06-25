import {
  IsString,
  IsEnum,
  IsInt,
  IsDateString,
  IsNotEmpty,
  Min,
  Validate,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { QuizDateRangeConstraint } from './quiz-date-range.validator';

export enum CreateQuizStatusEnum {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  CLOSED = 'closed',
  ARCHIVED = 'archived',
}

export class CreateQuizDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsEnum(CreateQuizStatusEnum)
  status!: CreateQuizStatusEnum;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMinutes!: number;

  @IsInt()
  passingScore!: number;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  @Validate(QuizDateRangeConstraint)
  endsAt!: string;

  @IsString()
  createdById!: string;
}
