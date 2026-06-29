import { Transform } from 'class-transformer';
import { IsOptional, IsEnum, IsString } from 'class-validator';
import { QuizStatusEnum } from './quiz-status.enum';

export class QuizQueryDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsEnum(QuizStatusEnum)
  status?: QuizStatusEnum;
}
