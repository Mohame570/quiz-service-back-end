-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "NotificationTemplateKey" AS ENUM ('VERIFICATION', 'QUIZ_INVITATION');

-- CreateEnum
CREATE TYPE "CheatingEventType" AS ENUM ('TAB_HIDDEN', 'WINDOW_BLUR', 'WINDOW_FOCUS', 'FULLSCREEN_EXIT', 'COPY_PASTE', 'OTHER');

-- CreateTable
CREATE TABLE "email_delivery_logs" (
    "id" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "templateKey" "NotificationTemplateKey" NOT NULL,
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "correlationId" TEXT,
    "errorMessage" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "metadata" JSONB,
    "lastAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_delivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cheating_event_logs" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "eventType" "CheatingEventType" NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cheating_event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_delivery_logs_status_createdAt_idx" ON "email_delivery_logs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "email_delivery_logs_templateKey_recipientEmail_idx" ON "email_delivery_logs"("templateKey", "recipientEmail");

-- CreateIndex
CREATE INDEX "email_delivery_logs_correlationId_idx" ON "email_delivery_logs"("correlationId");

-- CreateIndex
CREATE INDEX "cheating_event_logs_attemptId_occurredAt_idx" ON "cheating_event_logs"("attemptId", "occurredAt");

-- CreateIndex
CREATE INDEX "cheating_event_logs_eventType_occurredAt_idx" ON "cheating_event_logs"("eventType", "occurredAt");

