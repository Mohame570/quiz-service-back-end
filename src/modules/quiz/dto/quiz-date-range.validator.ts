import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'isQuizDateRange', async: false })
export class QuizDateRangeConstraint implements ValidatorConstraintInterface {
  validate(endsAt: string | null | undefined, args: ValidationArguments): boolean {
    if (!endsAt) {
      return true;
    }

    const object = args.object as {
      startsAt?: string | null;
      endsAt?: string | null;
    };

    if (!object.startsAt) {
      return true;
    }

    const startsAtTime = Date.parse(object.startsAt);
    const endsAtTime = Date.parse(endsAt);

    if (Number.isNaN(startsAtTime) || Number.isNaN(endsAtTime)) {
      return true;
    }

    return endsAtTime > startsAtTime;
  }

  defaultMessage(): string {
    return 'endsAt must be after startsAt';
  }
}
