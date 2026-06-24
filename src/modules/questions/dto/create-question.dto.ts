import { IsString, IsNotEmpty, IsEnum, IsArray, ArrayMinSize, ValidateIf, Validate, IsInt, IsOptional, Min, ArrayUnique } from 'class-validator';
import { ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';
import { QuestionType } from '../../../generated/prisma/client';

@ValidatorConstraint({ name: 'isValidCorrectAnswer', async: false })
export class IsValidCorrectAnswerConstraint implements ValidatorConstraintInterface {
  validate(correctAnswer: string, args: ValidationArguments) {
    const object = args.object as any;
    if (object.type === QuestionType.TRUE_FALSE) {
      return correctAnswer === 'True' || correctAnswer === 'False';
    }
    if (object.type === QuestionType.MCQ) {
      if (!Array.isArray(object.options)) return false;
      return object.options.includes(correctAnswer);
    }
    return false;
  }

  defaultMessage(args: ValidationArguments) {
    const object = args.object as any;
    if (object.type === QuestionType.TRUE_FALSE) {
      return 'correctAnswer must be "True" or "False" for TRUE_FALSE questions';
    }
    return 'correctAnswer must be one of the provided options for MCQ questions';
  }
}

export class CreateQuestionDto {
  @IsString()
  @IsNotEmpty()
  quizId!: string;

  @IsEnum(QuestionType)
  type!: QuestionType;

  @IsString()
  @IsNotEmpty()
  text!: string;

  @ValidateIf(o => o.type === QuestionType.MCQ)
  @IsArray()
  @ArrayMinSize(2)
  @ArrayUnique()
  @IsString({ each: true })
  options?: string[];

  @IsString()
  @IsNotEmpty()
  @Validate(IsValidCorrectAnswerConstraint)
  correctAnswer!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  points?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
