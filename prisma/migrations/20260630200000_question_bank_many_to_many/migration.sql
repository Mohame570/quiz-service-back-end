-- CreateTable
CREATE TABLE "quiz_questions" (
    "quizId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER,

    CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("quizId","questionId")
);

-- CreateIndex
CREATE INDEX "quiz_questions_quizId_idx" ON "quiz_questions"("quizId");

-- CreateIndex
CREATE INDEX "quiz_questions_questionId_idx" ON "quiz_questions"("questionId");

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed existing data from questions into the new join table before dropping the columns
INSERT INTO "quiz_questions" ("quizId", "questionId", "order")
SELECT "quizId", "id", "order" FROM "questions" WHERE "quizId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "questions_quizId_fkey";

-- DropIndex
DROP INDEX "questions_quizId_idx";

-- AlterTable
ALTER TABLE "questions" DROP COLUMN "order",
DROP COLUMN "quizId";

-- AlterTable
ALTER TABLE "quizzes" ALTER COLUMN "durationMinutes" DROP NOT NULL,
ALTER COLUMN "durationMinutes" DROP DEFAULT;
