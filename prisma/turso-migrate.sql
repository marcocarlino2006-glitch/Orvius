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
ALTER TABLE "Business" ADD COLUMN "founderCertJson" TEXT;
ALTER TABLE "WaitlistEntry" ADD COLUMN "lastContactedAt" DATETIME;
ALTER TABLE "WaitlistEntry" ADD COLUMN "nextActionAt" DATETIME;

-- Closed-loop: sendable estimates + tech field magic links
ALTER TABLE "Estimate" ADD COLUMN "publicToken" TEXT;
ALTER TABLE "Estimate" ADD COLUMN "sentAt" DATETIME;
ALTER TABLE "Estimate" ADD COLUMN "acceptedAt" DATETIME;
CREATE UNIQUE INDEX IF NOT EXISTS "Estimate_publicToken_key" ON "Estimate"("publicToken");
ALTER TABLE "Job" ADD COLUMN "techToken" TEXT;
ALTER TABLE "Job" ADD COLUMN "etaText" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Job_techToken_key" ON "Job"("techToken");

-- Sales bulletproof: confirm loop + overflow ack
ALTER TABLE "Job" ADD COLUMN "customerConfirmToken" TEXT;
ALTER TABLE "Job" ADD COLUMN "customerConfirmedAt" DATETIME;
CREATE UNIQUE INDEX IF NOT EXISTS "Job_customerConfirmToken_key" ON "Job"("customerConfirmToken");
ALTER TABLE "Business" ADD COLUMN "overflowForwardConfirmedAt" DATETIME;

-- Demand capture: canonical job category, service-area ZIP, lead lifecycle
ALTER TABLE "Lead" ADD COLUMN "categoryCode" TEXT;
ALTER TABLE "Lead" ADD COLUMN "postalCode" TEXT;
ALTER TABLE "Lead" ADD COLUMN "firstContactedAt" DATETIME;
ALTER TABLE "Lead" ADD COLUMN "closedAt" DATETIME;
CREATE INDEX IF NOT EXISTS "Lead_businessId_categoryCode_idx" ON "Lead"("businessId", "categoryCode");
CREATE INDEX IF NOT EXISTS "Lead_businessId_postalCode_idx" ON "Lead"("businessId", "postalCode");
ALTER TABLE "Job" ADD COLUMN "categoryCode" TEXT;
ALTER TABLE "Job" ADD COLUMN "postalCode" TEXT;
CREATE INDEX IF NOT EXISTS "Job_businessId_categoryCode_idx" ON "Job"("businessId", "categoryCode");

-- Confirmation lifecycle: real delivery stamps + one unconfirmed reminder
ALTER TABLE "Job" ADD COLUMN "customerConfirmSentAt" DATETIME;
ALTER TABLE "Job" ADD COLUMN "customerConfirmReminderSentAt" DATETIME;

-- Outcome loop: what the technician actually found and what the work closed at
ALTER TABLE "Job" ADD COLUMN "resolutionCode" TEXT;
ALTER TABLE "Job" ADD COLUMN "resolutionSummary" TEXT;
ALTER TABLE "Job" ADD COLUMN "finalAmountCents" INTEGER;
ALTER TABLE "Job" ADD COLUMN "outcomeCapturedAt" DATETIME;

-- Passwordless sign-in: single-use, hashed magic-link tokens
CREATE TABLE IF NOT EXISTS "LoginToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "usedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "LoginToken_tokenHash_key" ON "LoginToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "LoginToken_email_createdAt_idx" ON "LoginToken"("email", "createdAt");
CREATE INDEX IF NOT EXISTS "LoginToken_expiresAt_idx" ON "LoginToken"("expiresAt");

-- Crew duplication: ensureCrew read the technician table and then created the
-- owner row, so two requests arriving together each saw it empty and each
-- seeded one. The dispatch page fetches the board and the crew in parallel, so
-- that happened on a shop's first ever load; two fixture shops carry three
-- identical owner records and the board draws the same person three times.
--
-- The unique index below is what closes it, and it cannot be created while the
-- duplicates are still there. So: point every job at the oldest row of its
-- (business, name) group, drop the rest, then add the index. All three
-- statements are no-ops on a database that has already been through this.
UPDATE "Job"
SET "technicianId" = (
  SELECT MIN(keep."id")
  FROM "Technician" keep
  WHERE keep."businessId" = (
      SELECT had."businessId" FROM "Technician" had WHERE had."id" = "Job"."technicianId"
    )
    AND keep."name" = (
      SELECT had."name" FROM "Technician" had WHERE had."id" = "Job"."technicianId"
    )
)
WHERE "technicianId" IS NOT NULL;

DELETE FROM "Technician"
WHERE "id" NOT IN (
  SELECT MIN("id") FROM "Technician" GROUP BY "businessId", "name"
);

CREATE UNIQUE INDEX IF NOT EXISTS "Technician_businessId_name_key"
  ON "Technician"("businessId", "name");

-- Connect: the shop's own Stripe account, so customer card money settles to
-- the shop and Orvius only takes an application fee. chargesEnabled is
-- Stripe's post-verification verdict and is what gates card collection.
ALTER TABLE "Business" ADD COLUMN "stripeConnectAccountId" TEXT;
ALTER TABLE "Business" ADD COLUMN "stripeConnectChargesEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Business" ADD COLUMN "stripeConnectPayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Business" ADD COLUMN "stripeConnectDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Business" ADD COLUMN "stripeConnectUpdatedAt" DATETIME;
ALTER TABLE "Business" ADD COLUMN "depositEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Business" ADD COLUMN "depositAmountCents" INTEGER;

CREATE TABLE IF NOT EXISTS "Deposit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "leadId" TEXT,
  "jobId" TEXT,
  "amountCents" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "publicToken" TEXT,
  "stripeSessionId" TEXT,
  "stripePaymentIntentId" TEXT,
  "applicationFeeCents" INTEGER,
  "sentAt" DATETIME,
  "paidAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Deposit_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Deposit_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Deposit_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Deposit_publicToken_key" ON "Deposit"("publicToken");
CREATE UNIQUE INDEX IF NOT EXISTS "Deposit_stripeSessionId_key" ON "Deposit"("stripeSessionId");
CREATE INDEX IF NOT EXISTS "Deposit_businessId_status_idx" ON "Deposit"("businessId", "status");
CREATE INDEX IF NOT EXISTS "Deposit_businessId_createdAt_idx" ON "Deposit"("businessId", "createdAt");

-- One Stripe account belongs to exactly one shop. Without this, a mis-keyed
-- account id makes the lookup in syncConnectAccount ambiguous, and one shop's
-- payment status can be reported on another shop's dashboard.
CREATE UNIQUE INDEX IF NOT EXISTS "Business_stripeConnectAccountId_key"
  ON "Business"("stripeConnectAccountId");

-- Capture path persistence — confirm stamp must match the ritual the UI shows.
ALTER TABLE "Business" ADD COLUMN "captureMode" TEXT DEFAULT 'forward';
ALTER TABLE "Business" ADD COLUMN "forwardCarrier" TEXT;

-- Shop identity, service area, and overflow proof trail. Every Business read
-- selects these, so a deploy without them fails the whole dashboard.
ALTER TABLE "Business" ADD COLUMN "trade" TEXT;
ALTER TABLE "Business" ADD COLUMN "address" TEXT;
ALTER TABLE "Business" ADD COLUMN "forwardGuideSentAt" DATETIME;
ALTER TABLE "Business" ADD COLUMN "overflowProvedAt" DATETIME;
ALTER TABLE "Business" ADD COLUMN "serviceZipsJson" TEXT NOT NULL DEFAULT '[]';

-- Environment separation: demo and test workspaces are labeled, never mixed
-- into a production workspace.
ALTER TABLE "Business" ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'production';
UPDATE "Business" SET "environment" = 'demo'
  WHERE "slug" IN ('summit-hvac', 'summit-hvac-demo') AND "environment" = 'production';

-- Trade playbook: appointment length per job, skills per technician.
ALTER TABLE "Job" ADD COLUMN "durationMin" INTEGER;
ALTER TABLE "Technician" ADD COLUMN "skillsJson" TEXT NOT NULL DEFAULT '[]';

-- Operating-loop audit trail. The unique key makes retries write once.
CREATE TABLE IF NOT EXISTS "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL DEFAULT 'orvius',
    "summary" TEXT NOT NULL,
    "detailJson" TEXT,
    "callId" TEXT,
    "leadId" TEXT,
    "customerId" TEXT,
    "jobId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AuditEvent_businessId_idempotencyKey_key" ON "AuditEvent"("businessId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "AuditEvent_businessId_createdAt_idx" ON "AuditEvent"("businessId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_businessId_entityType_entityId_idx" ON "AuditEvent"("businessId", "entityType", "entityId");
CREATE INDEX IF NOT EXISTS "AuditEvent_leadId_idx" ON "AuditEvent"("leadId");
CREATE INDEX IF NOT EXISTS "AuditEvent_jobId_idx" ON "AuditEvent"("jobId");
CREATE INDEX IF NOT EXISTS "AuditEvent_customerId_idx" ON "AuditEvent"("customerId");

-- Autopilot: routine confirmations and clear-cut assignments run without the owner.
ALTER TABLE "Business" ADD COLUMN "autopilot" BOOLEAN NOT NULL DEFAULT true;

-- Live transfer: callers who insist on a person are connected to this number. Null = off.
ALTER TABLE "Business" ADD COLUMN "transferPhone" TEXT;

-- Per-shop receptionist voice. Null = default voice.
ALTER TABLE "Business" ADD COLUMN "voiceId" TEXT;

-- In-call booking: the slot the caller took on the call, and the returning-caller note sent to the live receptionist.
ALTER TABLE "Call" ADD COLUMN "heldSlotAt" DATETIME;
ALTER TABLE "Call" ADD COLUMN "heldSlotDurationMin" INTEGER;
ALTER TABLE "Call" ADD COLUMN "callerContextSentAt" DATETIME;

-- "Since you looked" anchored on the account, not the device.
ALTER TABLE "Business" ADD COLUMN "ownerLastSeenAt" DATETIME;

-- Web push: installed app / browser alerts for the owner.
CREATE TABLE IF NOT EXISTS "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "lastSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSubscription_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX IF NOT EXISTS "PushSubscription_businessId_idx" ON "PushSubscription"("businessId");

-- Live booking: when a caller's hold was claimed. Earlier claims win a race for the last technician.
ALTER TABLE "Call" ADD COLUMN "heldClaimedAt" DATETIME;

-- Confirmation text delivery: a carrier rejection alerts the owner to call instead.
ALTER TABLE "Job" ADD COLUMN "customerConfirmSid" TEXT;
ALTER TABLE "Job" ADD COLUMN "customerConfirmFailedAt" DATETIME;
CREATE INDEX IF NOT EXISTS "Job_customerConfirmSid_idx" ON "Job"("customerConfirmSid");

-- Live booking: holds ordered by a database-assigned sequence, so a later hold can never miss an earlier one.
ALTER TABLE "Call" ADD COLUMN "heldSeq" INTEGER;

-- Weekly results email to the owner.
ALTER TABLE "Business" ADD COLUMN "weeklyReportSentAt" DATETIME;

-- Owner's own calendar blocks booking.
ALTER TABLE "Business" ADD COLUMN "busyCalendarUrl" TEXT;
ALTER TABLE "Business" ADD COLUMN "busyCalendarJson" TEXT;
ALTER TABLE "Business" ADD COLUMN "busyCalendarSyncedAt" DATETIME;
ALTER TABLE "Business" ADD COLUMN "busyCalendarError" TEXT;
