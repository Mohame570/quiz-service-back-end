-- AlterEnum
ALTER TYPE "QuestionType" ADD VALUE 'MULTI_SELECT';

-- AlterTable
ALTER TABLE "attempt_answers" ADD COLUMN     "selectedOptionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "snapshotCorrectAnswer" TEXT,
ADD COLUMN     "snapshotCorrectAnswers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "snapshotOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "snapshotPoints" INTEGER,
ADD COLUMN     "snapshotText" TEXT,
ADD COLUMN     "snapshotType" "QuestionType";

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "correctAnswers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "correctAnswer" SET DEFAULT '';
