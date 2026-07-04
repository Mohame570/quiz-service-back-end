-- AlterEnum
ALTER TYPE "QuestionType" ADD VALUE 'SHORT_TEXT';
ALTER TYPE "QuestionType" ADD VALUE 'ESSAY';

-- AlterTable
ALTER TABLE "attempt_answers" ADD COLUMN "textAnswer" TEXT;
