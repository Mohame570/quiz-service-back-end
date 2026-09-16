-- CreateTable
CREATE TABLE "organization_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "organizationName" TEXT NOT NULL DEFAULT 'PitIQ',
    "timezoneLabel" TEXT NOT NULL DEFAULT 'UTC',
    "defaultPassThreshold" INTEGER NOT NULL DEFAULT 50,
    "defaultDurationMinutes" INTEGER NOT NULL DEFAULT 60,
    "integrityReviewThreshold" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("id")
);
