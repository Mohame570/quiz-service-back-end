-- Migration: 20260618120000_add_result_model
-- Adds a dedicated Result table that stores the final scored output
-- of a submitted attempt. Populated by ScoringService after submission.

CREATE TABLE "results" (
  "id"          TEXT NOT NULL,
  "attemptId"   TEXT NOT NULL,
  "studentId"   TEXT NOT NULL,
  "quizId"      TEXT NOT NULL,
  "score"       INTEGER NOT NULL,
  "maxScore"    INTEGER NOT NULL,
  "percentage"  DOUBLE PRECISION NOT NULL,
  "passed"      BOOLEAN NOT NULL,
  "gradedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "results_pkey" PRIMARY KEY ("id")
);

-- One result per attempt (enforced at DB level)
CREATE UNIQUE INDEX "results_attemptId_key" ON "results"("attemptId");

-- Indexes for admin queries
CREATE INDEX "ix_results_studentId" ON "results"("studentId");
CREATE INDEX "ix_results_quizId"    ON "results"("quizId");
CREATE INDEX "ix_results_passed"    ON "results"("passed");

-- FK to attempts
ALTER TABLE "results"
  ADD CONSTRAINT "results_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "attempts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
