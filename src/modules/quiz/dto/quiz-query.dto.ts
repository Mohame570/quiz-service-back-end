import { Transform } from 'class-transformer';
import { IsOptional, IsEnum } from 'class-validator';

export enum QuizQueryStatusEnum {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

export class QuizQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsEnum(QuizQueryStatusEnum)
  status?: QuizQueryStatusEnum;
}
