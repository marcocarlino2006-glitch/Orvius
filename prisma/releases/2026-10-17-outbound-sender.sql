-- Outbound sender. One nullable column: existing rows read NULL (sender not
-- kept), which the reply resolver treats as "any number", exactly as before.
-- Nothing is rebuilt, backfilled or dropped.
ALTER TABLE "OutboundSms" ADD COLUMN "fromNormalized" TEXT;
