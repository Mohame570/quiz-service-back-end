-- Student profiles and quiz assignment join table
CREATE TABLE "student_profiles" (
    "userId" TEXT NOT NULL,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "_QuizToStudentProfile" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX "_QuizToStudentProfile_AB_unique" ON "_QuizToStudentProfile"("A", "B");
CREATE INDEX "_QuizToStudentProfile_B_index" ON "_QuizToStudentProfile"("B");

-- Normalize attempt/answer IDs from UUID to TEXT for unified cuid strategy
ALTER TABLE "attempts" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "attempts" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
ALTER TABLE "attempts" ALTER COLUMN "quizId" TYPE TEXT USING "quizId"::TEXT;
ALTER TABLE "attempts" ALTER COLUMN "studentId" TYPE TEXT USING "studentId"::TEXT;

ALTER TABLE "attempt_answers" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "attempt_answers" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
ALTER TABLE "attempt_answers" ALTER COLUMN "attemptId" TYPE TEXT USING "attemptId"::TEXT;
ALTER TABLE "attempt_answers" ALTER COLUMN "questionId" TYPE TEXT USING "questionId"::TEXT;
ALTER TABLE "attempt_answers" ALTER COLUMN "selectedOptionId" TYPE TEXT USING "selectedOptionId"::TEXT;

-- Foreign keys for attempt relations
ALTER TABLE "student_profiles"
  ADD CONSTRAINT "student_profiles_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attempts"
  ADD CONSTRAINT "attempts_quizId_fkey"
  FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attempts"
  ADD CONSTRAINT "attempts_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "student_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attempt_answers"
  ADD CONSTRAINT "attempt_answers_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attempt_answers"
  ADD CONSTRAINT "attempt_answers_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "_QuizToStudentProfile"
  ADD CONSTRAINT "_QuizToStudentProfile_A_fkey"
  FOREIGN KEY ("A") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_QuizToStudentProfile"
  ADD CONSTRAINT "_QuizToStudentProfile_B_fkey"
  FOREIGN KEY ("B") REFERENCES "student_profiles"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
