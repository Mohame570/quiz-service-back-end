-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'CLAIMED', 'EXPIRED');

-- AlterTable
ALTER TABLE "email_delivery_logs" ADD COLUMN     "invitationId" TEXT;

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "userId" TEXT,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invitations_recipientEmail_status_idx" ON "invitations"("recipientEmail", "status");

-- CreateIndex
CREATE INDEX "invitations_userId_status_idx" ON "invitations"("userId", "status");

-- CreateIndex
CREATE INDEX "invitations_quizId_status_idx" ON "invitations"("quizId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_quizId_recipientEmail_key" ON "invitations"("quizId", "recipientEmail");

-- CreateIndex
CREATE INDEX "email_delivery_logs_invitationId_idx" ON "email_delivery_logs"("invitationId");

-- AddForeignKey
ALTER TABLE "email_delivery_logs" ADD CONSTRAINT "email_delivery_logs_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "invitations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
