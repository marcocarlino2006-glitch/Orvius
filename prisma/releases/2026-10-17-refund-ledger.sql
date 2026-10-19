-- Refund ledger. Two additive columns with a constant default: existing rows
-- read 0 (no refund recorded), nothing is rebuilt, backfilled or dropped, and
-- code without these columns keeps reading the tables unchanged.
ALTER TABLE "Payment" ADD COLUMN "refundedCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Deposit" ADD COLUMN "refundedCents" INTEGER NOT NULL DEFAULT 0;
