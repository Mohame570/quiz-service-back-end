import { IsString, IsNotEmpty, IsEnum, IsArray, ArrayMinSize, ValidateIf, Validate, IsInt, IsOptional, Min, ArrayUnique } from 'class-validator';
import { ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';
import { QuestionType, Difficulty } from '../../../generated/prisma/client';

@ValidatorConstraint({ name: 'isValidCorrectAnswer', async: false })
export class IsValidCorrectAnswerConstraint implements ValidatorConstraintInterface {
  validate(correctAnswer: string | undefined, args: ValidationArguments) {
    const object = args.object as { type?: QuestionType; options?: string[]; correctAnswers?: string[] };
    if (object.type === QuestionType.ESSAY) {
      return correctAnswer === undefined || typeof correctAnswer === 'string';
    }
    if (object.type === QuestionType.MULTI_SELECT) {
      const answers = (object as any).correctAnswers;
      if (!Array.isArray(answers) || answers.length < 1) return false;
      if (!Array.isArray(object.options)) return false;
      return answers.every(a => object.options!.includes(a));
    }
    if (typeof correctAnswer !== 'string' || correctAnswer.trim() === '') {
      return false;
    }
    if (object.type === QuestionType.SHORT_TEXT) {
      return correctAnswer.trim().length > 0;
    }
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
    const object = args.object as { type?: QuestionType };
    if (object.type === QuestionType.TRUE_FALSE) {
      return 'correctAnswer must be "True" or "False" for TRUE_FALSE questions';
    }
    if (object.type === QuestionType.SHORT_TEXT) {
      return 'correctAnswer must be a non-empty string for SHORT_TEXT questions';
    }
    if (object.type === QuestionType.ESSAY) {
      return 'correctAnswer must be a string for ESSAY questions';
    }
    if (object.type === QuestionType.MULTI_SELECT) {
      return 'correctAnswers must be non-empty array of valid options for MULTI_SELECT';
    }
    return 'correctAnswer must be one of the provided options for MCQ questions';
  }
}

export class CreateQuestionDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  quizIds?: string[];

  @IsEnum(QuestionType)
  type!: QuestionType;

  @IsString()
  @IsNotEmpty()
  text!: string;

  @ValidateIf(o => o.type === QuestionType.MCQ || o.type === QuestionType.MULTI_SELECT)
  @IsArray()
  @ArrayMinSize(2)
  @ArrayUnique()
  @IsString({ each: true })
  options?: string[];

  @Validate(IsValidCorrectAnswerConstraint)
  correctAnswer?: string;

  @ValidateIf(o => o.type === QuestionType.MULTI_SELECT)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  correctAnswers?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  points?: number;

  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @IsOptional()
  @IsString()
  topic?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  tags?: string[];

}
