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
import { QuizStatusEnum } from './quiz-status.enum';

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
  @IsEnum(QuizStatusEnum)
  status!: QuizStatusEnum;

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
