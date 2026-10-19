#!/usr/bin/env node
/*
 * Before refunds were recorded on the receipt, a partial refund left only an
 * audit row ("invoice.partially_refunded" / "deposit.partially_refunded") with
 * Stripe's running total for that charge. This reads those rows and plans the
 * receipt's refundedCents from them:
 *
 *   - per charge, the highest running total seen (never a sum of totals);
 *   - a deposit row names its deposit; an invoice row is applied only when it
 *     names its payment, or the bill has exactly one card receipt;
 *   - anything else is listed as ambiguous and left alone for a person;
 *   - a receipt already marked refunded, or already holding a higher amount,
 *     is skipped, so running it twice changes nothing.
 *
 * Those audit rows were written before refunds were checked against the
 * shop's connected account, so review the plan before applying it.
 *
 *   DATABASE_URL=file:/tmp/copy.db node scripts/refund-backfill.mjs            # plan only
 *   DATABASE_URL=file:/tmp/copy.db node scripts/refund-backfill.mjs --apply    # local copy
 *
 * Applying to anything but a local file needs REFUND_BACKFILL_APPROVAL set to
 * the approval reference for that run.
 */
import { pathToFileURL } from "node:url";

const OWNER_METHODS = new Set(["cash", "check", "bank", "other", "customer_attested", "customer_said"]);
const RECEIPT = new Set(["recorded", "paid", "succeeded", "refunded"]);

function detailOf(json) {
  try {
    const v = JSON.parse(json ?? "null");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export async function planRefundBackfill(prisma, { businessId } = {}) {
  const rows = await prisma.auditEvent.findMany({
    where: { ...(businessId ? { businessId } : {}), action: { in: ["invoice.partially_refunded", "invoice.refunded", "deposit.partially_refunded", "deposit.refunded"] } },
    select: { businessId: true, action: true, detailJson: true },
  });
  const byCharge = new Map();
  for (const row of rows) {
    const d = detailOf(row.detailJson);
    const cents = Number(d.amountRefundedCents);
    if (!d.chargeId || !Number.isFinite(cents) || cents <= 0) continue;
    const key = `${row.businessId}:${d.chargeId}`;
    const prev = byCharge.get(key);
    if (!prev || cents > prev.cents) byCharge.set(key, { businessId: row.businessId, chargeId: d.chargeId, cents, depositId: d.depositId ?? null, invoiceId: d.invoiceId ?? null, paymentId: d.paymentId ?? null });
  }

  const apply = [];
  const ambiguous = [];
  const skipped = [];
  for (const obs of byCharge.values()) {
    if (obs.depositId) {
      const dep = await prisma.deposit.findFirst({ where: { id: obs.depositId, businessId: obs.businessId }, select: { id: true, amountCents: true, status: true, refundedCents: true } });
      if (!dep || !["paid", "refunded"].includes(dep.status)) ambiguous.push({ ...obs, why: "deposit_missing_or_unpaid" });
      else if (dep.status === "refunded" || dep.refundedCents >= Math.min(obs.cents, dep.amountCents)) skipped.push({ ...obs, why: "already_recorded" });
      else apply.push({ table: "deposit", id: dep.id, cents: Math.min(obs.cents, dep.amountCents), chargeId: obs.chargeId, businessId: obs.businessId });
      continue;
    }
    if (!obs.invoiceId) {
      ambiguous.push({ ...obs, why: "no_record_named" });
      continue;
    }
    const payments = await prisma.payment.findMany({ where: { invoiceId: obs.invoiceId, businessId: obs.businessId }, select: { id: true, amountCents: true, status: true, method: true, refundedCents: true } });
    const card = obs.paymentId
      ? payments.filter((p) => p.id === obs.paymentId)
      : payments.filter((p) => RECEIPT.has(p.status) && !OWNER_METHODS.has((p.method ?? "").toLowerCase()));
    if (card.length !== 1) {
      ambiguous.push({ ...obs, why: card.length ? "several_card_receipts" : "no_card_receipt" });
      continue;
    }
    const p = card[0];
    const cents = Math.min(obs.cents, p.amountCents);
    if (p.status === "refunded" || p.refundedCents >= cents) skipped.push({ ...obs, why: "already_recorded" });
    else apply.push({ table: "payment", id: p.id, cents, chargeId: obs.chargeId, businessId: obs.businessId });
  }
  return { apply, ambiguous, skipped };
}

/** Only ever raises a recorded refund, so a repeat or a concurrent webhook can't lower one. */
export async function applyRefundBackfill(prisma, plan) {
  let changed = 0;
  for (const item of plan.apply) {
    const where = { id: item.id, refundedCents: { lt: item.cents } };
    const data = { refundedCents: item.cents };
    const done = item.table === "payment" ? await prisma.payment.updateMany({ where, data }) : await prisma.deposit.updateMany({ where, data });
    changed += done.count;
  }
  return changed;
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const doApply = process.argv.includes("--apply");
  if (doApply && !url.startsWith("file:") && !process.env.REFUND_BACKFILL_APPROVAL?.trim()) {
    throw new Error("refund-backfill refused: --apply on a non-local database needs REFUND_BACKFILL_APPROVAL");
  }
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const plan = await planRefundBackfill(prisma);
    console.log(JSON.stringify({ apply: plan.apply.length, ambiguous: plan.ambiguous, skipped: plan.skipped.length, items: plan.apply }, null, 2));
    if (doApply) console.log(`changed ${await applyRefundBackfill(prisma, plan)} receipt(s)`);
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
