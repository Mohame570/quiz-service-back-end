import { Transform } from 'class-transformer';
import { IsOptional, IsEnum } from 'class-validator';

export enum QuizQueryStatusEnum {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  CLOSED = 'closed',
  ARCHIVED = 'archived',
}

export class QuizQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsEnum(QuizQueryStatusEnum)
  status?: QuizQueryStatusEnum;
}
