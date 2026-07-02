-- CreateEnum
CREATE TYPE "GradingStatus" AS ENUM ('PARTIAL', 'COMPLETE');

-- AlterTable
ALTER TABLE "attempt_answers" ADD COLUMN "pointsEarned" INTEGER,
ADD COLUMN "gradedById" TEXT,
ADD COLUMN "gradedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "results" ADD COLUMN "gradingStatus" "GradingStatus" NOT NULL DEFAULT 'COMPLETE',
ADD COLUMN "pendingEssayCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "results" ALTER COLUMN "passed" DROP NOT NULL;
