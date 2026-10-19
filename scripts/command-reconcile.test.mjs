#!/usr/bin/env node
/*
 * Command approvals: who may approve, and what happens when something fails
 * after a change already landed. Disposable database, no providers.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "RESEND_API_KEY"]) {
  delete process.env[key];
}

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

let failNotify = false;
const realNotify = await import("../src/lib/notify-tech-assign.ts");
mock.module(new URL("../src/lib/notify-tech-assign.ts", import.meta.url).href, {
  namedExports: {
    ...realNotify,
    notifyTechOnAssign: async (...args) => {
      if (failNotify) throw new Error("injected: carrier timed out");
      return realNotify.notifyTechOnAssign(...args);
    },
  },
});

let failAuditAction = null;
const realAudit = await import("../src/lib/audit.ts");
mock.module(new URL("../src/lib/audit.ts", import.meta.url).href, {
  namedExports: {
    ...realAudit,
    recordAudit: async (input) => {
      if (failAuditAction && input.action === failAuditAction) throw new Error("injected: audit write failed");
      return realAudit.recordAudit(input);
    },
  },
});

const { executeProposal, resolveReconcile, needsCheck, STALE_EXECUTING_MS } = await import("../src/lib/copilot-execute.ts");
const { GET, POST } = await import("../src/app/api/copilot/route.ts");
const { can } = await import("../src/lib/workspace-access-labels.ts");
const { buildCommandBoard } = await import("../src/lib/command-board.ts");
const { prisma } = await import("../src/lib/prisma.ts");

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const made = [];
const owner = { role: "owner", email: "owner@example.test" };

async function makeShop() {
  const shop = await prisma.business.create({
    data: {
      name: "Reconcile HVAC",
      slug: `recon-${uid()}`,
      environment: "test",
      trade: "HVAC",
      billingStatus: "active",
      billingPlan: "pro",
      ownerEmail: `owner-${uid()}@example.test`,
    },
  });
  made.push(shop.id);
  return shop;
}

async function assignSetup(shop) {
  const tech = await prisma.technician.create({ data: { businessId: shop.id, name: "Ana", skillsJson: "[]" } });
  const job = await prisma.job.create({
    data: { businessId: shop.id, title: "AC not cooling", serviceType: "AC", status: "scheduled", address: "1 Oak St" },
  });
  const proposal = await prisma.copilotAction.create({
    data: {
      businessId: shop.id,
      action: "assign_tech",
      paramsJson: JSON.stringify({ jobId: job.id, technicianId: tech.id }),
      preview: "Assign Ana to AC not cooling",
      status: "proposed",
    },
  });
  return { tech, job, proposal };
}

const call = (mode, body) =>
  POST(new Request(`http://local.test/api/copilot?mode=${mode}`, { method: "POST", body: JSON.stringify(body) }));

test("only the owner approves Command plans by role; anyone else needs an owner's grant", () => {
  assert.equal(can("owner", "command.approve"), true);
  for (const role of ["manager", "dispatcher"]) assert.equal(can(role, "command.approve"), false, role);
});

test("a failure after the change is flagged to check, never re-run, and a person resolves it", async () => {
  const shop = await makeShop();
  const { job, proposal } = await assignSetup(shop);
  failNotify = true;
  try {
    const out = await executeProposal({ business: shop, proposalId: proposal.id, by: owner });
    assert.equal(out.ok, false);
    assert.equal(out.reason, "needs_check");
    assert.doesNotMatch(out.error, /Nothing (was )?changed/);
    assert.ok((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).technicianId, "the change did land");
    const row = await prisma.copilotAction.findUniqueOrThrow({ where: { id: proposal.id } });
    assert.equal(row.status, "reconcile");
    assert.match(JSON.parse(row.resultJson).error, /carrier timed out/);

    failNotify = false;
    const again = await executeProposal({ business: shop, proposalId: proposal.id, by: owner });
    assert.equal(again.ok, false, "a flagged approval cannot be approved again blindly");
    assert.equal(again.status, 404);

    const resolved = await resolveReconcile({ business: shop, proposalId: proposal.id, happened: true, by: owner });
    assert.deepEqual(resolved, { ok: true, status: "executed" });
    assert.equal(await prisma.auditEvent.count({ where: { businessId: shop.id, action: "copilot.reconciled_done" } }), 1);
    assert.equal((await resolveReconcile({ business: shop, proposalId: proposal.id, happened: true, by: owner })).ok, false);
  } finally {
    failNotify = false;
  }
});

test("a change that landed but couldn't be recorded says so and is flagged, not 'nothing changed'", async () => {
  const shop = await makeShop();
  const { job, proposal } = await assignSetup(shop);
  failAuditAction = "copilot.executed";
  try {
    const out = await executeProposal({ business: shop, proposalId: proposal.id, by: owner });
    assert.equal(out.ok, true);
    assert.equal(out.recorded, false);
    assert.match(out.confirmation.summary, /couldn't save the record/);
    assert.ok((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).technicianId);
    const row = await prisma.copilotAction.findUniqueOrThrow({ where: { id: proposal.id } });
    assert.equal(row.status, "reconcile");
    assert.equal(JSON.parse(row.resultJson).done, true);

    const board = await buildCommandBoard(shop.id);
    const flagged = board.lanes.approvals.find((a) => a.proposalId === proposal.id);
    assert.equal(flagged?.needsCheck, "done_unrecorded");
    assert.doesNotMatch(flagged.detail, /assign tech/);

    failAuditAction = null;
    const denied = await resolveReconcile({ business: shop, proposalId: proposal.id, happened: false, by: owner });
    assert.equal(denied.ok, false, "a change known to have landed can't be sent back for a second run");
    assert.equal((await resolveReconcile({ business: shop, proposalId: proposal.id, happened: true, by: owner })).ok, true);
    assert.equal((await buildCommandBoard(shop.id)).lanes.approvals.length, 0);
  } finally {
    failAuditAction = null;
  }
});

test("a failure before any change goes back for approval and is marked as a failed attempt", async () => {
  const shop = await makeShop();
  const proposal = await prisma.copilotAction.create({
    data: { businessId: shop.id, action: "assign_tech", paramsJson: "{not json", preview: "broken", status: "proposed" },
  });
  const out = await executeProposal({ business: shop, proposalId: proposal.id, by: owner });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "failed_before_effect");
  assert.match(out.error, /Nothing was changed/);
  const row = await prisma.copilotAction.findUniqueOrThrow({ where: { id: proposal.id } });
  assert.equal(row.status, "proposed");
  assert.equal(JSON.parse(row.resultJson).failedBeforeEffect, true);

  const stuck = { status: "executing", createdAt: new Date(0) };
  assert.equal(needsCheck(stuck, new Date(STALE_EXECUTING_MS + 1)), true, "a run that crashed mid-way surfaces once stale");
  assert.equal(needsCheck(stuck, new Date(STALE_EXECUTING_MS - 1)), false);
});

test("approve, dismiss and resolve are refused outside the shop; GET lists items to check", async () => {
  const shop = await makeShop();
  const dispatcher = `dispatch-${uid()}@example.test`;
  await prisma.membership.create({ data: { businessId: shop.id, email: dispatcher, role: "dispatcher" } });
  await prisma.commandGrant.create({
    data: { businessId: shop.id, granteeEmail: dispatcher, action: "assign_tech", effect: "assigns", expiresAt: new Date(Date.now() + 86_400_000), policyVersion: "command-authority-1", grantedByEmail: shop.ownerEmail },
  });
  const { proposal } = await assignSetup(shop);

  signedInAs = `stranger-${uid()}@example.test`;
  assert.equal((await call("execute", { proposalId: proposal.id, approved: true })).status, 404);
  assert.equal((await call("cancel", { proposalId: proposal.id })).status, 404);
  signedInAs = null;
  assert.equal((await call("resolve", { proposalId: proposal.id, outcome: "done" })).status, 401);
  assert.equal((await prisma.copilotAction.findUniqueOrThrow({ where: { id: proposal.id } })).status, "proposed");

  signedInAs = dispatcher;
  failNotify = true;
  try {
    const res = await call("execute", { proposalId: proposal.id, approved: true });
    assert.equal(res.status, 500);
    assert.equal((await res.json()).reason, "needs_check");
  } finally {
    failNotify = false;
  }
  const listed = await (await GET()).json();
  assert.deepEqual(listed.needsCheck.map((i) => [i.id, i.state]), [[proposal.id, "unknown"]]);

  const notDone = await call("resolve", { proposalId: proposal.id, outcome: "not_done" });
  assert.equal(notDone.status, 200);
  assert.equal((await prisma.copilotAction.findUniqueOrThrow({ where: { id: proposal.id } })).status, "proposed");
  const audit = await prisma.auditEvent.findFirstOrThrow({ where: { businessId: shop.id, action: "copilot.reconciled_not_done" } });
  assert.match(audit.actor + (audit.actorEmail ?? ""), new RegExp(dispatcher.split("@")[0]));
  signedInAs = null;
});

test.after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});
