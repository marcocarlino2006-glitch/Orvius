-- Canonical job receivables, version 1. PREPARED, NOT EXECUTED.
-- Not part of turso-migrate.sql and not applied by any build or release step.
-- Applying it needs the approved migration step (approval, exact release commit,
-- allow-listed target, reviewed checksum, backup), run with
-- MIGRATION_PLAN_FILE=prisma/prepared/receivables-v1.sql. Trigger bodies hold
-- semicolons inside BEGIN ... END; the turso-migrate splitter keeps each
-- CREATE TRIGGER whole, and scripts/turso-migrate.test.mjs proves the split
-- statements build the same guarded tables on a disposable database. Do not
-- run it through any other splitter.
--
-- Rules the database itself enforces:
--   * at most one canonical receivable per shop and job; any number of
--     non-canonical rows, including jobId = NULL (plan charges, extras)
--   * an issued revision never changes amounts or lines; it may only be
--     superseded, and only while no payment or deposit application exists
--   * facts (payments, deposit applications, adjustments, credits, refunds,
--     checkout attempts) are append-only while the shop exists

CREATE TABLE IF NOT EXISTS "JobReceivable" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "jobId" TEXT REFERENCES "Job"("id") ON DELETE SET NULL,
  "canonical" INTEGER NOT NULL DEFAULT 0 CHECK ("canonical" IN (0, 1)),
  "kind" TEXT NOT NULL DEFAULT 'job' CHECK ("kind" IN ('job', 'job_extra', 'plan_charge')),
  "sourceInvoiceId" TEXT UNIQUE,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("canonical" = 0 OR ("kind" = 'job' AND "jobId" IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS "JobReceivable_one_canonical_per_job"
  ON "JobReceivable" ("businessId", "jobId") WHERE "canonical" = 1;
CREATE INDEX IF NOT EXISTS "JobReceivable_businessId_kind" ON "JobReceivable" ("businessId", "kind");

CREATE TABLE IF NOT EXISTS "ReceivableRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "receivableId" TEXT NOT NULL REFERENCES "JobReceivable"("id") ON DELETE CASCADE,
  "revision" INTEGER NOT NULL CHECK ("revision" >= 1),
  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft', 'issued', 'superseded')),
  "subtotalCents" INTEGER NOT NULL CHECK ("subtotalCents" >= 0),
  "taxCents" INTEGER NOT NULL DEFAULT 0 CHECK ("taxCents" >= 0),
  "taxBps" INTEGER NOT NULL DEFAULT 0,
  "totalCents" INTEGER NOT NULL CHECK ("totalCents" = "subtotalCents" + "taxCents"),
  "linesJson" TEXT NOT NULL DEFAULT '[]',
  "issuedAt" DATETIME,
  "supersededAt" DATETIME,
  "supersededByRevision" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("receivableId", "revision")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReceivableRevision_one_issued"
  ON "ReceivableRevision" ("receivableId") WHERE "status" = 'issued';

CREATE TRIGGER IF NOT EXISTS "ReceivableRevision_issued_is_immutable"
BEFORE UPDATE ON "ReceivableRevision"
WHEN OLD."status" <> 'draft' AND (
  NEW."receivableId" IS NOT OLD."receivableId" OR NEW."revision" IS NOT OLD."revision"
  OR NEW."subtotalCents" IS NOT OLD."subtotalCents" OR NEW."taxCents" IS NOT OLD."taxCents"
  OR NEW."taxBps" IS NOT OLD."taxBps" OR NEW."totalCents" IS NOT OLD."totalCents"
  OR NEW."linesJson" IS NOT OLD."linesJson" OR NEW."issuedAt" IS NOT OLD."issuedAt"
  OR OLD."status" = 'superseded'
  OR NEW."status" NOT IN ('issued', 'superseded')
)
BEGIN
  SELECT RAISE(ABORT, 'issued receivable revision is immutable');
END;

CREATE TRIGGER IF NOT EXISTS "ReceivableRevision_no_supersede_after_payment"
BEFORE UPDATE OF "status" ON "ReceivableRevision"
WHEN NEW."status" = 'superseded' AND EXISTS (
  SELECT 1 FROM "ReceivableFact" f
  WHERE f."receivableId" = OLD."receivableId" AND f."kind" IN ('payment', 'deposit_application')
)
BEGIN
  SELECT RAISE(ABORT, 'receivable has money against it; use an adjustment or refund');
END;

CREATE TRIGGER IF NOT EXISTS "ReceivableRevision_issued_not_deleted"
BEFORE DELETE ON "ReceivableRevision"
WHEN OLD."status" <> 'draft' AND EXISTS (
  SELECT 1 FROM "JobReceivable" r JOIN "Business" b ON b."id" = r."businessId" WHERE r."id" = OLD."receivableId"
)
BEGIN
  SELECT RAISE(ABORT, 'issued receivable revision cannot be deleted');
END;

CREATE TABLE IF NOT EXISTS "ReceivableFact" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "receivableId" TEXT NOT NULL REFERENCES "JobReceivable"("id") ON DELETE CASCADE,
  "revision" INTEGER NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('payment', 'deposit_application', 'adjustment', 'credit', 'refund', 'checkout_attempt')),
  "amountCents" INTEGER NOT NULL CHECK ("amountCents" >= 0),
  "depositId" TEXT,
  "legacyPaymentId" TEXT UNIQUE,
  "checkoutSessionId" TEXT,
  "exception" TEXT CHECK ("exception" IS NULL OR "exception" IN ('late_old_session', 'overpaid')),
  "reason" TEXT,
  "actor" TEXT,
  "occurredAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("kind" <> 'deposit_application' OR "depositId" IS NOT NULL),
  CHECK ("kind" NOT IN ('adjustment', 'credit', 'refund') OR "reason" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "ReceivableFact_receivableId" ON "ReceivableFact" ("receivableId", "kind");
CREATE UNIQUE INDEX IF NOT EXISTS "ReceivableFact_one_payment_per_session"
  ON "ReceivableFact" ("checkoutSessionId") WHERE "kind" = 'payment' AND "checkoutSessionId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "ReceivableFact_one_attempt_per_session"
  ON "ReceivableFact" ("checkoutSessionId") WHERE "kind" = 'checkout_attempt';
CREATE INDEX IF NOT EXISTS "ReceivableFact_depositId" ON "ReceivableFact" ("depositId") WHERE "depositId" IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS "ReceivableFact_no_update"
BEFORE UPDATE ON "ReceivableFact"
BEGIN
  SELECT RAISE(ABORT, 'receivable facts are append-only');
END;

CREATE TRIGGER IF NOT EXISTS "ReceivableFact_no_delete"
BEFORE DELETE ON "ReceivableFact"
WHEN EXISTS (SELECT 1 FROM "Business" b WHERE b."id" = OLD."businessId")
BEGIN
  SELECT RAISE(ABORT, 'receivable facts are append-only');
END;
