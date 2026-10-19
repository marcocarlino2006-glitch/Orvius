#!/usr/bin/env node
/*
 * The operating-platform proof loop, on a disposable database with no
 * providers: a versioned per-shop system-of-record contract only the owner
 * changes, correlations written once and never repointed, one exception per
 * disagreement about create/change/cancel/complete/payment, and a proof-loop
 * metric that excludes demos, self-tests, account creation, aggregate
 * payments and the call/text-lead filter, and never claims causation.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";

const nextServer = await import("next/server");
mock.module("next/server", { namedExports: { ...nextServer, after: () => {} } });

let signedInAs = null;
mock.module(new URL("../src/auth.ts", import.meta.url).href, {
  namedExports: {
    auth: async () => (signedInAs ? { user: { email: signedInAs } } : null),
    signIn: async () => {},
    signOut: async () => {},
    handlers: {},
  },
});

const sor = await import("../src/lib/system-of-record.ts");
const route = await import("../src/app/api/record-contract/route.ts");
const { prisma } = await import("../src/lib/prisma.ts");

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const made = [];
async function makeShop() {
  const shop = await prisma.business.create({
    data: { name: "Record HVAC", slug: `sor-${uid()}`, environment: "test", trade: "HVAC", hoursJson: "{}", servicesJson: "[]", billingStatus: "active", billingPlan: "pro", ownerEmail: `owner-${uid()}@example.test` },
  });
  made.push(shop.id);
  return shop;
}
test.after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

test("a shop without a contract runs on Orvius defaults as version 0; each change is a new version only the owner makes", async () => {
  const shop = await makeShop();
  const first = await sor.getRecordContract(shop.id);
  assert.deepEqual([first.version, first.implicit, first.domains.job_state, first.domains.payment_receipt], [0, true, "orvius", "stripe"]);

  const put = (body) => route.PUT(new Request("http://x/api/record-contract", { method: "PUT", body: JSON.stringify(body) }));
  const manager = `m-${uid()}@example.test`;
  await prisma.membership.create({ data: { businessId: shop.id, email: manager, role: "manager" } });
  signedInAs = manager;
  assert.equal((await put({ domains: { job_state: "jobber" } })).status, 403);

  signedInAs = shop.ownerEmail;
  assert.equal((await put({ domains: { job_state: "spreadsheet" } })).status, 422);
  assert.equal((await put({ domains: { weather: "orvius" } })).status, 422);
  const ok = await put({ domains: { job_state: "jobber", customer: "jobber" } });
  assert.equal(ok.status, 200);
  await put({ domains: { job_state: "orvius" } });
  const rows = await prisma.shopRecordContract.findMany({ where: { businessId: shop.id }, orderBy: { version: "asc" } });
  assert.deepEqual(rows.map((r) => [r.version, JSON.parse(r.domainsJson).job_state]), [[1, "jobber"], [2, "orvius"]]);
  const audits = await prisma.auditEvent.count({ where: { businessId: shop.id, action: "record_contract.updated" } });
  assert.equal(audits, 2);
  signedInAs = null;
});

test("a correlation is written once; repointing either side raises one exception instead of overwriting", async () => {
  const shop = await makeShop();
  const base = { businessId: shop.id, entityType: "job", system: "jobber" };
  assert.deepEqual(await sor.correlate({ ...base, entityId: "job-1", externalId: "J-100" }), { ok: true, created: true });
  assert.deepEqual(await sor.correlate({ ...base, entityId: "job-1", externalId: "J-100" }), { ok: true, created: false });
  const moved = await sor.correlate({ ...base, entityId: "job-1", externalId: "J-200" });
  assert.equal(moved.ok, false);
  const again = await sor.correlate({ ...base, entityId: "job-1", externalId: "J-200" });
  assert.equal(again.exceptionId, moved.exceptionId, "the same disagreement is one exception");
  const stolen = await sor.correlate({ ...base, entityId: "job-2", externalId: "J-100" });
  assert.equal(stolen.ok, false);
  const links = await prisma.externalCorrelation.findMany({ where: { businessId: shop.id } });
  assert.deepEqual(links.map((l) => [l.entityId, l.externalId, l.contractVersion]), [["job-1", "J-100", 0]]);
  assert.equal(await prisma.reconciliationException.count({ where: { businessId: shop.id, kind: "correlation" } }), 2);
  await assert.rejects(sor.correlate({ ...base, entityId: "job-3", externalId: "  " }), /external id/);
});

test("job disagreements are classified and recorded once each; resolving needs a reason and the right role", async () => {
  const snap = (o) => ({ status: "scheduled", scheduledAt: "2026-10-20T15:00:00.000Z", totalCents: null, paidCents: null, ...o });
  assert.deepEqual(sor.diffJob(snap({}), snap({})), []);
  assert.deepEqual(sor.diffJob(snap({}), null), ["create"]);
  assert.deepEqual(sor.diffJob(snap({}), snap({ scheduledAt: "2026-10-21T15:00:00.000Z" })), ["change"]);
  assert.deepEqual(sor.diffJob(snap({}), snap({ status: "cancelled" })), ["cancel"]);
  assert.deepEqual(sor.diffJob(snap({ status: "completed", totalCents: 20000, paidCents: 20000 }), snap({ status: "on_site" })), ["complete", "payment"]);

  const shop = await makeShop();
  const args = { businessId: shop.id, jobId: "job-9", system: "jobber", externalId: "J-9", orvius: snap({ status: "completed", totalCents: 100, paidCents: 100 }), external: snap({ status: "completed", totalCents: 100, paidCents: 0 }) };
  const first = await sor.reconcileJob(args);
  const second = await sor.reconcileJob(args);
  assert.deepEqual(first.kinds, ["payment"]);
  assert.deepEqual(second.exceptionIds, first.exceptionIds);

  const post = (body) => route.POST(new Request("http://x/api/record-contract", { method: "POST", body: JSON.stringify(body) }));
  const dispatcher = `d-${uid()}@example.test`;
  await prisma.membership.create({ data: { businessId: shop.id, email: dispatcher, role: "dispatcher" } });
  signedInAs = dispatcher;
  assert.equal((await post({ id: first.exceptionIds[0], resolution: "fixed" })).status, 403);
  signedInAs = shop.ownerEmail;
  assert.equal((await post({ id: first.exceptionIds[0], resolution: "  " })).status, 422);
  assert.equal((await post({ id: first.exceptionIds[0], resolution: "Payment was cash; marked paid in Jobber" })).status, 200);
  assert.equal((await post({ id: first.exceptionIds[0], resolution: "again" })).status, 409);
  const other = await makeShop();
  signedInAs = other.ownerEmail;
  const foreign = await sor.reconcileJob({ ...args, jobId: "job-10" });
  signedInAs = other.ownerEmail;
  assert.equal((await post({ id: foreign.exceptionIds[0], resolution: "not mine" })).status, 409, "another shop's exception is not reachable");
  signedInAs = null;
});

test("existing sync rows map to the correlations they imply, without writing anything", () => {
  const out = sor.correlationsFromSyncRows({
    jobber: [
      { businessId: "b", leadId: "l1", status: "done", jobberClientId: "C1", jobberRequestId: "R1" },
      { businessId: "b", leadId: "l2", status: "check", jobberClientId: null, jobberRequestId: null },
    ],
    quickbooks: [{ businessId: "b", sourceType: "invoice", sourceId: "inv1", status: "done", qbReceiptId: "Q1" }],
  });
  assert.deepEqual(out.map((c) => `${c.system}:${c.entityType}:${c.entityId}:${c.externalId}`), ["jobber:lead:l1:R1", "quickbooks:invoice:inv1:Q1"]);
});

test("the proof loop counts closed real loops only, reports the call/text-lead count as association, and never claims causation", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/proof-loop.json", import.meta.url), "utf8"));
  const contracts = { "p-jobber": { version: 1, implicit: false, domains: { job_state: "jobber" } } };
  const m = sor.proofLoopMetrics({ ...fixture, contracts });
  assert.equal(m.attribution, "observed_not_causal");
  assert.deepEqual(m.closedJobIds.sort(), ["j-closed-call", "j-closed-jobber", "j-closed-web"]);
  assert.deepEqual(m.excluded, {
    demo_or_test_shop: 2,
    setup_sandbox: 1,
    self_test: 1,
    account_creation: 1,
    not_inbound: 1,
    aggregate_payment: 1,
    no_completion: 1,
    unpaid: 1,
    correction_completion: 1,
    missing_correlation: 1,
    open_exception: 1,
  });
  assert.equal(m.leadSourcedJobs.count, 7);
  assert.match(m.leadSourcedJobs.meaning, /association only/);
});
