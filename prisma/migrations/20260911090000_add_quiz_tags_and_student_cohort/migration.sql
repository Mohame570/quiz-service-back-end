-- AlterTable
ALTER TABLE "quizzes" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "student_profiles" ADD COLUMN "cohort" TEXT;

-- CreateIndex
CREATE INDEX "student_profiles_cohort_idx" ON "student_profiles"("cohort");
