import {
  IsString,
  IsOptional,
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
}

export class CreateQuizDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description!: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsEnum(CreateQuizStatusEnum)
  status!: CreateQuizStatusEnum;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMinutes!: number;

  @IsOptional()
  @IsInt()
  passingScore!: number;

  @IsOptional()
  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsDateString()
  @Validate(QuizDateRangeConstraint)
  endsAt!: string;

  @IsOptional()
  @IsString()
  createdById!: string;
}
