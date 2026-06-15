-- Align users table with the current Prisma User model.
-- Earlier migration history on some databases created a stripped-down users table.

DO $$
BEGIN
  CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'STUDENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'name'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'full_name'
  ) THEN
    ALTER TABLE "users" RENAME COLUMN "name" TO "full_name";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'createdAt'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE "users" RENAME COLUMN "createdAt" TO "created_at";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'updatedAt'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE "users" RENAME COLUMN "updatedAt" TO "updated_at";
  END IF;
END $$;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'STUDENT';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "verification_token" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "verification_token_expires_at" TIMESTAMPTZ;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;

UPDATE "users"
SET "password_hash" = '$2b$12$invalid.placeholder.hash.for.migration.only'
WHERE "password_hash" IS NULL;

ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "users_verification_token_key"
  ON "users"("verification_token")
  WHERE "verification_token" IS NOT NULL;

-- Drop legacy creatorId column if createdById is present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quizzes' AND column_name = 'creatorId'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quizzes' AND column_name = 'createdById'
  ) THEN
    ALTER TABLE "quizzes" DROP CONSTRAINT IF EXISTS "quizzes_creatorId_fkey";
    DROP INDEX IF EXISTS "quizzes_creatorId_idx";
    ALTER TABLE "quizzes" DROP COLUMN "creatorId";
  END IF;
END $$;

ALTER TABLE "quizzes" ALTER COLUMN "createdById" DROP NOT NULL;
