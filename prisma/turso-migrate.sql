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

ALTER TABLE "Business" ADD COLUMN "avgTicketCents" INTEGER;
ALTER TABLE "Call" ADD COLUMN "successEvaluation" TEXT;

CREATE TABLE IF NOT EXISTS "Estimate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "jobId" TEXT,
    "leadId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "lineItemsJson" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Estimate_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Estimate_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Estimate_jobId_key" ON "Estimate"("jobId");
CREATE INDEX IF NOT EXISTS "Estimate_businessId_status_idx" ON "Estimate"("businessId", "status");
CREATE INDEX IF NOT EXISTS "Estimate_businessId_createdAt_idx" ON "Estimate"("businessId", "createdAt");

CREATE TABLE IF NOT EXISTS "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "estimateId" TEXT,
    "jobId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_estimateId_key" ON "Invoice"("estimateId");
CREATE INDEX IF NOT EXISTS "Invoice_businessId_status_idx" ON "Invoice"("businessId", "status");

CREATE TABLE IF NOT EXISTS "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'recorded',
    "method" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Payment_businessId_createdAt_idx" ON "Payment"("businessId", "createdAt");

CREATE TABLE IF NOT EXISTS "CopilotAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "paramsJson" TEXT NOT NULL,
    "preview" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "resultJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedAt" DATETIME,
    CONSTRAINT "CopilotAction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CopilotAction_businessId_status_idx" ON "CopilotAction"("businessId", "status");
CREATE INDEX IF NOT EXISTS "CopilotAction_businessId_createdAt_idx" ON "CopilotAction"("businessId", "createdAt");

ALTER TABLE "Business" ADD COLUMN "ownerSmsOptOutAt" DATETIME;

CREATE TABLE IF NOT EXISTS "SmsOptOut" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneNormalized" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'inbound-sms',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedAt" DATETIME,
    CONSTRAINT "SmsOptOut_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SmsOptOut_businessId_phoneNormalized_key" ON "SmsOptOut"("businessId", "phoneNormalized");
CREATE INDEX IF NOT EXISTS "SmsOptOut_businessId_clearedAt_idx" ON "SmsOptOut"("businessId", "clearedAt");

ALTER TABLE "Business" ADD COLUMN "baselineMissedCallsPerWeek" INTEGER;
ALTER TABLE "Business" ADD COLUMN "baselineJobsPerWeek" INTEGER;
ALTER TABLE "WaitlistEntry" ADD COLUMN "notes" TEXT;
ALTER TABLE "Business" ADD COLUMN "pilotEndsAt" DATETIME;
ALTER TABLE "Business" ADD COLUMN "lastWeeklyProofAt" DATETIME;
ALTER TABLE "WaitlistEntry" ADD COLUMN "lastContactedAt" DATETIME;
ALTER TABLE "WaitlistEntry" ADD COLUMN "nextActionAt" DATETIME;
