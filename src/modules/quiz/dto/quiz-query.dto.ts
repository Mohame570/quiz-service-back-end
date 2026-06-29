import { Transform } from 'class-transformer';
import { IsOptional, IsEnum } from 'class-validator';
import { QuizStatusEnum } from './quiz-status.enum';

export class QuizQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsEnum(QuizStatusEnum)
  status?: QuizStatusEnum;
}
