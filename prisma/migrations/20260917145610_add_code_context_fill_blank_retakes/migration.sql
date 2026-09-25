-- CreateEnum
CREATE TYPE "ScoreStrategy" AS ENUM ('BEST', 'LATEST');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "QuestionType" ADD VALUE 'CODE_CONTEXT';
ALTER TYPE "QuestionType" ADD VALUE 'FILL_BLANK';

-- AlterTable
ALTER TABLE "attempt_answers" ADD COLUMN     "snapshotCodeLanguage" TEXT,
ADD COLUMN     "snapshotCodeSnippet" TEXT;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "codeLanguage" TEXT,
ADD COLUMN     "codeSnippet" TEXT;

-- AlterTable
ALTER TABLE "quizzes" ADD COLUMN     "maxAttempts" INTEGER,
ADD COLUMN     "scoreStrategy" "ScoreStrategy" NOT NULL DEFAULT 'LATEST';
