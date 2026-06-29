UPDATE "quizzes"
SET "durationMinutes" = 30
WHERE "durationMinutes" IS NULL OR "durationMinutes" <= 0;

ALTER TABLE "quizzes"
  ALTER COLUMN "durationMinutes" SET DEFAULT 30,
  ALTER COLUMN "durationMinutes" SET NOT NULL;

ALTER TABLE "attempts" ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "attempts" AS attempt
SET "expiresAt" =
  attempt."startedAt" +
  (quiz."durationMinutes" * INTERVAL '1 minute')
FROM "quizzes" AS quiz
WHERE attempt."quizId" = quiz."id"
  AND attempt."expiresAt" IS NULL;

ALTER TABLE "attempts" ALTER COLUMN "expiresAt" SET NOT NULL;
CREATE INDEX "attempts_status_expiresAt_idx" ON "attempts"("status", "expiresAt");
