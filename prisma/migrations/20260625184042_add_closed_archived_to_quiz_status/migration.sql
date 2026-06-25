-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "QuizStatus" ADD VALUE 'CLOSED';
ALTER TYPE "QuizStatus" ADD VALUE 'ARCHIVED';

-- AlterTable
ALTER TABLE "_QuizToStudentProfile" ADD CONSTRAINT "_QuizToStudentProfile_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_QuizToStudentProfile_AB_unique";

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "verification_token_expires_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- RenameIndex
ALTER INDEX "ix_results_passed" RENAME TO "results_passed_idx";

-- RenameIndex
ALTER INDEX "ix_results_quizId" RENAME TO "results_quizId_idx";

-- RenameIndex
ALTER INDEX "ix_results_studentId" RENAME TO "results_studentId_idx";
