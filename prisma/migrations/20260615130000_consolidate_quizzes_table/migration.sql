-- Align the canonical quizzes table with the current Prisma schema and
-- remove the duplicate legacy "Quiz" table created by an earlier migration.

DO $$
BEGIN
  CREATE TYPE "QuizStatus" AS ENUM ('DRAFT', 'PUBLISHED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "status" "QuizStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER;
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "passingScore" INTEGER;
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "startsAt" TIMESTAMP(3);
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "endsAt" TIMESTAMP(3);
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'quizzes'
      AND column_name = 'creatorId'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'quizzes'
      AND column_name = 'createdById'
  ) THEN
    ALTER TABLE "quizzes" RENAME COLUMN "creatorId" TO "createdById";
  END IF;
END $$;

ALTER TABLE "quizzes" ALTER COLUMN "createdById" DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'Quiz'
  ) THEN
    INSERT INTO "quizzes" (
      "id",
      "title",
      "description",
      "status",
      "durationMinutes",
      "passingScore",
      "startsAt",
      "endsAt",
      "createdById",
      "createdAt",
      "updatedAt"
    )
    SELECT
      q."id",
      q."title",
      q."description",
      q."status",
      q."durationMinutes",
      q."passingScore",
      q."startsAt",
      q."endsAt",
      q."createdById",
      q."createdAt",
      q."updatedAt"
    FROM "Quiz" q
    ON CONFLICT ("id") DO UPDATE SET
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "status" = EXCLUDED."status",
      "durationMinutes" = EXCLUDED."durationMinutes",
      "passingScore" = EXCLUDED."passingScore",
      "startsAt" = EXCLUDED."startsAt",
      "endsAt" = EXCLUDED."endsAt",
      "createdById" = EXCLUDED."createdById",
      "updatedAt" = EXCLUDED."updatedAt";

    DROP TABLE "Quiz";
  END IF;
END $$;

DROP INDEX IF EXISTS "quizzes_creatorId_idx";
CREATE INDEX IF NOT EXISTS "quizzes_status_idx" ON "quizzes"("status");
CREATE INDEX IF NOT EXISTS "quizzes_createdById_idx" ON "quizzes"("createdById");
CREATE INDEX IF NOT EXISTS "quizzes_startsAt_endsAt_idx" ON "quizzes"("startsAt", "endsAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quizzes_createdById_fkey'
  ) THEN
    ALTER TABLE "quizzes"
      ADD CONSTRAINT "quizzes_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
