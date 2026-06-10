import { IsOptional, IsEnum } from 'class-validator';

export enum QuizQueryStatusEnum {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

export class QuizQueryDto {
  @IsOptional()
  @IsEnum(QuizQueryStatusEnum)
  status?: QuizQueryStatusEnum;
}
