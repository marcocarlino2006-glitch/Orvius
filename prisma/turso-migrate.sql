-- Idempotent Turso migrations (safe to re-run)

ALTER TABLE "Business" ADD COLUMN "billingPlan" TEXT;
ALTER TABLE "Business" ADD COLUMN "lineVerifiedAt" DATETIME;

ALTER TABLE "Call" ADD COLUMN "ownerNotifiedAt" DATETIME;

ALTER TABLE "Lead" ADD COLUMN "externalId" TEXT;

CREATE TABLE IF NOT EXISTS "OwnerNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "leadId" TEXT,
    "channel" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "businessName" TEXT,
    "message" TEXT,
    "ownerPhone" TEXT,
    "ownerEmail" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" DATETIME,
    "deliveryId" TEXT,
    "deliveryStatus" TEXT,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OwnerNotification_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "OwnerNotification_businessId_dedupeKey_channel_key" ON "OwnerNotification"("businessId", "dedupeKey", "channel");
CREATE INDEX IF NOT EXISTS "OwnerNotification_businessId_createdAt_idx" ON "OwnerNotification"("businessId", "createdAt");
CREATE INDEX IF NOT EXISTS "OwnerNotification_businessId_status_idx" ON "OwnerNotification"("businessId", "status");
CREATE INDEX IF NOT EXISTS "OwnerNotification_status_nextRetryAt_idx" ON "OwnerNotification"("status", "nextRetryAt");

CREATE TABLE IF NOT EXISTS "WebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "businessId" TEXT,
    "status" TEXT NOT NULL,
    "payloadJson" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebhookEvent_source_externalId_eventType_key" ON "WebhookEvent"("source", "externalId", "eventType");
CREATE INDEX IF NOT EXISTS "WebhookEvent_businessId_createdAt_idx" ON "WebhookEvent"("businessId", "createdAt");
CREATE INDEX IF NOT EXISTS "WebhookEvent_source_createdAt_idx" ON "WebhookEvent"("source", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "Lead_businessId_externalId_key" ON "Lead"("businessId", "externalId");
CREATE INDEX IF NOT EXISTS "Lead_businessId_createdAt_idx" ON "Lead"("businessId", "createdAt");
