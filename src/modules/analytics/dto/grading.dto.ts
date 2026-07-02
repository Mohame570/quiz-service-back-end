import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GradingQueueQueryDto {
  @IsOptional()
  @IsString()
  quizId?: string;
}

export class GradeEssayAnswerDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pointsEarned!: number;
}
