import {
  IsString,
  IsEnum,
  IsInt,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  Min,
  Validate,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { QuizDateRangeConstraint } from './quiz-date-range.validator';
import { QuizStatusEnum } from './quiz-status.enum';
import { ScoreStrategy } from '../../../generated/prisma/client';
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

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  @Validate(QuizDateRangeConstraint)
  endsAt?: string;

  @IsString()
  createdById!: string;
    @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxAttempts?: number;

  @IsOptional()
  @IsEnum(ScoreStrategy)
  scoreStrategy?: ScoreStrategy;
}

