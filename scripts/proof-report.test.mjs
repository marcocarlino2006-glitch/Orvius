#!/usr/bin/env node
/*
 * Proof and economics reporting through the routes. A production shop with:
 * one real call-to-paid loop, a job the owner typed in and was paid cash for,
 * a job completed by correction, a job Jobber owns but isn't linked to, and a
 * job made while the shop was still in setup. The report keeps observed
 * loops, manual activity, modelled costs and missing data apart, claims no
 * causation, and changes no price.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "RESEND_API_KEY", "STRIPE_SECRET_KEY"]) delete process.env[key];
process.env.ORVIUS_ADMIN_KEY = "local-admin-key-for-tests";

const nextServer = await import("next/server");
mock.module("next/server", { namedExports: { ...nextServer, after: () => {} } });
let signedInAs = null;
mock.module(new URL("../src/auth.ts", import.meta.url).href, {
  namedExports: { auth: async () => (signedInAs ? { user: { email: signedInAs } } : null), signIn: async () => {}, signOut: async () => {}, handlers: {} },
});

const proofRoute = await import("../src/app/api/reports/proof/route.ts");
const adminRoute = await import("../src/app/api/admin/economics/route.ts");
const { prisma } = await import("../src/lib/prisma.ts");
const { NextRequest } = nextServer;

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
test.after(async () => {
  await prisma.$disconnect();
});

async function seed() {
  const owner = `owner-${uid()}@example.test`;
  const liveAt = new Date(Date.now() - 20 * 86_400_000);
  const shop = await prisma.business.create({
    data: { name: "Proof HVAC", slug: `proof-${uid()}`, environment: "production", billingStatus: "active", billingPlan: "pro", ownerEmail: owner, setupJson: JSON.stringify({ liveAt: liveAt.toISOString() }) },
  });
  const job = async ({ source, status = "completed", completion = "transition", paid = null, createdAt = new Date() }) => {
    const lead = source ? await prisma.lead.create({ data: { businessId: shop.id, phone: "+15550006001", source, status: "booked" } }) : null;
    const j = await prisma.job.create({ data: { businessId: shop.id, leadId: lead?.id ?? null, title: "Repair", status, createdAt } });
    if (completion) {
      await prisma.auditEvent.create({
        data: { businessId: shop.id, entityType: "job", entityId: j.id, jobId: j.id, action: completion === "correction" ? "job.completion_corrected" : "job.status_changed", actor: "owner", summary: "done", detailJson: JSON.stringify({ to: "completed", path: completion }) },
      });
    }
    if (paid) {
      const inv = await prisma.invoice.create({ data: { businessId: shop.id, jobId: j.id, amountCents: paid.cents, status: "paid", paidAt: new Date() } });
      await prisma.payment.create({ data: { businessId: shop.id, invoiceId: inv.id, amountCents: paid.cents, status: "recorded", method: paid.method } });
    }
    return j;
  };
  const loop = await job({ source: "call", paid: { cents: 30_000, method: "stripe:cs_proof" } });
  await job({ source: null, paid: { cents: 12_000, method: "cash" } });
  await job({ source: "call", completion: "correction", paid: { cents: 9_000, method: "stripe:cs_corr" } });
  await job({ source: "sms", status: "completed", completion: null });
  await job({ source: "call", paid: { cents: 5_000, method: "stripe:cs_early" }, createdAt: new Date(liveAt.getTime() - 86_400_000) });
  await prisma.call.create({ data: { businessId: shop.id, vapiCallId: `pc_${uid()}`, status: "ended", durationSec: 240, costMicros: 400_000 } });
  await prisma.call.create({ data: { businessId: shop.id, vapiCallId: `pc_${uid()}`, status: "ended", durationSec: 120, costMicros: null } });
  return { shop, owner, loop };
}

const get = (url, headers = {}) => new NextRequest(url, { headers });

test("owner report: observed loops, manual activity, modelled costs and missing data are separate", async () => {
  const { shop, owner, loop } = await seed();
  signedInAs = owner;
  const res = await proofRoute.GET(get("http://x/api/reports/proof?days=30"));
  signedInAs = null;
  assert.equal(res.status, 200);
  const r = await res.json();

  assert.equal(r.outcomes.attribution, "observed_not_causal");
  assert.deepEqual(r.outcomes.closedJobIds, [loop.id], "only the call-to-paid job completed through the transition");
  assert.equal(r.outcomes.excluded.not_inbound, 1, "the job the owner typed in");
  assert.equal(r.outcomes.excluded.correction_completion, 1);
  assert.equal(r.outcomes.excluded.no_completion, 1);
  assert.equal(r.outcomes.excluded.account_creation, 1, "made before the shop went live");
  assert.equal(r.causal.measured, false);

  assert.equal(r.manual.jobsNotFromAnInboundRequest, 1);
  assert.deepEqual([r.manual.manualPayments.count, r.manual.manualPayments.cents], [1, 12_000]);
  assert.equal(r.manual.cardPayments.count, 3);

  assert.deepEqual(r.costs.voice, { cents: 40, source: "provider_reported", calls: 1 });
  assert.equal(r.costs.telephony.source, "modelled_list_rate");
  const missing = Object.fromEntries(r.missing.map((m) => [m.what, m.count]));
  assert.equal(missing.calls_without_reported_cost, 1);
  assert.equal(missing.completed_jobs_without_a_recorded_completion, 1);
  assert.equal(missing.self_test_jobs_not_flagged, null, "a known gap, said out loud");

  await prisma.shopRecordContract.create({ data: { businessId: shop.id, version: 1, domainsJson: JSON.stringify({ job_state: "jobber" }), createdByEmail: owner } });
  signedInAs = owner;
  const jobber = await (await proofRoute.GET(get("http://x/api/reports/proof"))).json();
  signedInAs = null;
  assert.equal(jobber.outcomes.closedLoops, 0, "Jobber owns jobs and none are linked, so no loop is closed");
  assert.ok(jobber.missing.find((m) => m.what === "jobs_without_a_link_to_the_record_of_truth").count >= 1);
});

test("a dispatcher can't read the money report", async () => {
  const { shop } = await seed();
  const dispatcher = `d-${uid()}@example.test`;
  await prisma.membership.create({ data: { businessId: shop.id, email: dispatcher, role: "dispatcher" } });
  signedInAs = dispatcher;
  const res = await proofRoute.GET(get("http://x/api/reports/proof"));
  signedInAs = null;
  assert.equal(res.status, 403);
});

test("internal economics: costs with their sources, revenue and margin reported missing, not zero", async () => {
  await seed();
  assert.equal((await adminRoute.GET(get("http://x/api/admin/economics"))).status, 401);
  const res = await adminRoute.GET(get("http://x/api/admin/economics", { "x-orvius-admin-key": process.env.ORVIUS_ADMIN_KEY }));
  assert.equal(res.status, 200);
  const r = await res.json();
  assert.equal(r.policy, "observe_only");
  assert.equal(r.costs.voice.source, "provider_reported");
  assert.equal(r.costs.telephony.source, "estimate_list_rate");
  assert.equal(r.revenue, null);
  assert.equal(r.observedMarginCents, null);
  assert.ok(r.missing.some((m) => m.what === "subscription_and_overage_invoices"));
});

test("reporting is read-only and leaves pricing alone", () => {
  const src = readFileSync("src/lib/proof-report.ts", "utf8");
  assert.doesNotMatch(src, /\.(create|update|upsert|delete)(Many)?\(/);
  assert.doesNotMatch(src, /from "@\/lib\/(pricing-plans|stripe)/);
});
