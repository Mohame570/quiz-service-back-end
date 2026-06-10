import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsDateString,
  IsNotEmpty,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum UpdateQuizStatusEnum {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

export class UpdateQuizDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsEnum(UpdateQuizStatusEnum)
  status?: UpdateQuizStatusEnum;

  @IsOptional()
  @IsInt()
  durationMinutes?: number;

  @IsOptional()
  @IsInt()
  passingScore?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsString()
  createdById?: string;
}
