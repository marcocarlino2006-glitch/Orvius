#!/usr/bin/env node
/*
 * Command authority is action-scoped: the owner grants it, per person and kind
 * of plan, with an expiry and policy version, and it is rechecked when a plan
 * runs. Disposable database, no providers.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "RESEND_API_KEY"]) delete process.env[key];

const nextServer = await import("next/server");
mock.module("next/server", { namedExports: { ...nextServer, after: () => {} } });
let signedInAs = null;
mock.module(new URL("../src/auth.ts", import.meta.url).href, {
  namedExports: { auth: async () => (signedInAs ? { user: { email: signedInAs } } : null), signIn: async () => {}, signOut: async () => {}, handlers: {} },
});

const { decideApproval, mayPropose, grantableAction, COMMAND_POLICY_VERSION, NEVER_GRANTABLE, COMMAND_ACTION_EFFECT } = await import("../src/lib/command-authority.ts");
const { POST } = await import("../src/app/api/copilot/route.ts");
const grantsRoute = await import("../src/app/api/command/grants/route.ts");
const { executeProposal } = await import("../src/lib/copilot-execute.ts");
const { prisma } = await import("../src/lib/prisma.ts");

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const made = [];
const day = 86_400_000;

async function shopWithTeam() {
  const ownerEmail = `owner-${uid()}@example.test`;
  const shop = await prisma.business.create({
    data: { name: "Grant HVAC", slug: `grant-${uid()}`, environment: "test", trade: "HVAC", billingStatus: "active", billingPlan: "pro", ownerEmail },
  });
  made.push(shop.id);
  const manager = `mgr-${uid()}@example.test`;
  const dispatcher = `disp-${uid()}@example.test`;
  await prisma.membership.create({ data: { businessId: shop.id, email: manager, role: "manager" } });
  await prisma.membership.create({ data: { businessId: shop.id, email: dispatcher, role: "dispatcher" } });
  const tech = await prisma.technician.create({ data: { businessId: shop.id, name: "Ana", skillsJson: "[]" } });
  const job = await prisma.job.create({ data: { businessId: shop.id, title: "AC not cooling", serviceType: "AC", status: "scheduled", address: "1 Oak St" } });
  return { shop, ownerEmail, manager, dispatcher, tech, job };
}

const proposal = (shop, job, tech, extra = {}) =>
  prisma.copilotAction.create({
    data: { businessId: shop.id, action: "assign_tech", paramsJson: JSON.stringify({ jobId: job.id, technicianId: tech.id }), preview: "Assign Ana", status: "proposed", ...extra },
  });
const grant = (shop, email, extra = {}) =>
  prisma.commandGrant.create({
    data: { businessId: shop.id, granteeEmail: email, action: "assign_tech", effect: "assigns", expiresAt: new Date(Date.now() + day), policyVersion: COMMAND_POLICY_VERSION, grantedByEmail: "owner", ...extra },
  });
const call = (mode, body) => POST(new Request(`http://local.test/api/copilot?mode=${mode}`, { method: "POST", body: JSON.stringify(body) }));

test("money, settings, phone, team and deletion are never grantable; every current plan type is classified", () => {
  for (const [action, meta] of Object.entries(COMMAND_ACTION_EFFECT)) {
    assert.ok(meta.touches.every((t) => !NEVER_GRANTABLE.includes(t)), action);
    assert.equal(grantableAction(action), true, action);
  }
  assert.equal(grantableAction("refund_payment"), false);
  assert.equal(grantableAction("change_settings"), false);
});

test("the decision: owner approval vs. owner confirmation, grants, expiry, version, and no high-impact self-approval", () => {
  const g = (extra = {}) => ({ id: "g1", granteeEmail: "d@x", action: "assign_tech", conditionsJson: "{}", expiresAt: new Date(Date.now() + day), policyVersion: COMMAND_POLICY_VERSION, revokedAt: null, ...extra });
  const owner = { role: "owner", email: "o@x" };
  const disp = { role: "dispatcher", email: "d@x" };
  assert.deepEqual(decideApproval({ actor: owner, proposal: { action: "reschedule", proposedByEmail: null }, grants: [] }), { ok: true, kind: "owner_approval", grantId: null });
  assert.deepEqual(decideApproval({ actor: owner, proposal: { action: "reschedule", proposedByEmail: "O@x" }, grants: [] }), { ok: true, kind: "owner_confirmation", grantId: null });
  assert.equal(decideApproval({ actor: disp, proposal: { action: "assign_tech", proposedByEmail: null }, grants: [] }).ok, false, "role alone grants nothing");
  assert.equal(decideApproval({ actor: { role: "manager", email: "d@x" }, proposal: { action: "assign_tech", proposedByEmail: null }, grants: [] }).ok, false, "managers propose but do not approve by default");
  assert.deepEqual(decideApproval({ actor: disp, proposal: { action: "assign_tech", proposedByEmail: null }, grants: [g()] }), { ok: true, kind: "grant", grantId: "g1" });
  assert.equal(decideApproval({ actor: disp, proposal: { action: "assign_tech", proposedByEmail: null }, grants: [g({ expiresAt: new Date(Date.now() - 1) })] }).ok, false, "expired");
  assert.equal(decideApproval({ actor: disp, proposal: { action: "assign_tech", proposedByEmail: null }, grants: [g({ policyVersion: "old" })] }).ok, false, "older policy version");
  assert.equal(decideApproval({ actor: disp, proposal: { action: "assign_tech", proposedByEmail: null }, grants: [g({ revokedAt: new Date() })] }).ok, false, "revoked");
  assert.equal(decideApproval({ actor: disp, proposal: { action: "reschedule", proposedByEmail: null }, grants: [g()] }).ok, false, "a grant covers only its action");
  assert.equal(decideApproval({ actor: disp, proposal: { action: "assign_tech", proposedByEmail: "d@x" }, grants: [g()] }).ok, false, "self-approval needs the condition");
  assert.equal(decideApproval({ actor: disp, proposal: { action: "assign_tech", proposedByEmail: "d@x" }, grants: [g({ conditionsJson: '{"allowSelfExecution":true}' })] }).kind, "grant_self");
  const highSelf = decideApproval({ actor: disp, proposal: { action: "reschedule", proposedByEmail: "d@x" }, grants: [g({ action: "reschedule", conditionsJson: '{"allowSelfExecution":true}' })] });
  assert.equal(highSelf.ok, false, "a customer-facing plan is never self-approved");
  assert.equal(mayPropose({ role: "manager", email: "m@x" }, "reschedule", []), true);
  assert.equal(mayPropose(disp, "reschedule", []), false);
});

test("at execution: a dispatcher without a grant is refused and nothing runs; with one, the approval is recorded", async () => {
  const { shop, dispatcher, tech, job } = await shopWithTeam();
  const p = await proposal(shop, job, tech);
  signedInAs = dispatcher;
  const refused = await call("execute", { proposalId: p.id, approved: true });
  assert.equal(refused.status, 403);
  assert.equal((await prisma.copilotAction.findUniqueOrThrow({ where: { id: p.id } })).status, "proposed");
  assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).technicianId, null, "nothing changed");
  const g = await grant(shop, dispatcher);
  const ok = await call("execute", { proposalId: p.id, approved: true });
  assert.equal(ok.status, 200);
  const row = await prisma.copilotAction.findUniqueOrThrow({ where: { id: p.id } });
  assert.equal(row.approvalKind, "grant");
  assert.equal(row.grantId, g.id);
  const audit = await prisma.auditEvent.findFirstOrThrow({ where: { businessId: shop.id, action: "copilot.executed" } });
  assert.equal(JSON.parse(audit.detailJson).approval.policyVersion, COMMAND_POLICY_VERSION);
  signedInAs = null;
});

test("a grant revoked between proposal and approval no longer counts", async () => {
  const { shop, dispatcher, tech, job } = await shopWithTeam();
  const g = await grant(shop, dispatcher);
  const p = await proposal(shop, job, tech);
  await prisma.commandGrant.update({ where: { id: g.id }, data: { revokedAt: new Date() } });
  const out = await executeProposal({ business: shop, proposalId: p.id, by: { role: "dispatcher", email: dispatcher } });
  assert.equal(out.ok, false);
  assert.equal(out.status, 403);
});

test("an owner confirming their own request is labelled as such, not as a second check", async () => {
  const { shop, ownerEmail, tech, job } = await shopWithTeam();
  const p = await proposal(shop, job, tech, { proposedByEmail: ownerEmail, proposedByRole: "owner" });
  const out = await executeProposal({ business: shop, proposalId: p.id, by: { role: "owner", email: ownerEmail } });
  assert.equal(out.ok, true);
  assert.equal((await prisma.copilotAction.findUniqueOrThrow({ where: { id: p.id } })).approvalKind, "owner_confirmation");
  const audit = await prisma.auditEvent.findFirstOrThrow({ where: { businessId: shop.id, action: "copilot.executed" } });
  assert.match(audit.summary, /Owner confirmed their own request/);
});

test("a dispatcher can't ask for plans without a grant; a manager can propose routine plans", async () => {
  const { shop, manager, dispatcher, tech, job } = await shopWithTeam();
  signedInAs = dispatcher;
  assert.equal((await call("propose", { action: "assign_tech", jobId: job.id, technicianId: tech.id })).status, 403);
  signedInAs = manager;
  const res = await call("propose", { action: "assign_tech", jobId: job.id, technicianId: tech.id });
  assert.equal(res.status, 200);
  const { proposalId } = await res.json();
  const row = await prisma.copilotAction.findUniqueOrThrow({ where: { id: proposalId } });
  assert.equal(row.proposedByEmail, manager);
  assert.equal((await call("execute", { proposalId, approved: true })).status, 403, "proposing is not approving");
  signedInAs = null;
});

test("withdrawing: a pending plan can be withdrawn by its proposer; one that already started cannot", async () => {
  const { shop, manager, tech, job } = await shopWithTeam();
  const p = await proposal(shop, job, tech, { proposedByEmail: manager });
  signedInAs = manager;
  assert.equal((await call("cancel", { proposalId: p.id })).status, 200);
  const running = await proposal(shop, job, tech, { proposedByEmail: manager, status: "executing" });
  assert.equal((await call("cancel", { proposalId: running.id })).status, 404, "an executing plan is not pending; it goes to reconciliation");
  signedInAs = null;
});

test("only the owner issues grants, to team members, for grantable plans, with an expiry", async () => {
  const { shop, ownerEmail, manager, dispatcher } = await shopWithTeam();
  const post = (body) => grantsRoute.POST(new Request("http://local.test/api/command/grants", { method: "POST", body: JSON.stringify(body) }));
  const until = new Date(Date.now() + 7 * day).toISOString();
  signedInAs = manager;
  assert.equal((await post({ granteeEmail: dispatcher, action: "assign_tech", expiresAt: until })).status, 403);
  signedInAs = ownerEmail;
  assert.equal((await post({ granteeEmail: "stranger@example.test", action: "assign_tech", expiresAt: until })).status, 400);
  assert.equal((await post({ granteeEmail: dispatcher, action: "refund_payment", expiresAt: until })).status, 400);
  assert.equal((await post({ granteeEmail: dispatcher, action: "assign_tech", expiresAt: new Date(Date.now() + 365 * day).toISOString() })).status, 400);
  assert.equal((await post({ granteeEmail: dispatcher, action: "reschedule", expiresAt: until, conditions: { allowSelfExecution: true } })).status, 400);
  const ok = await post({ granteeEmail: dispatcher, action: "assign_tech", expiresAt: until });
  assert.equal(ok.status, 200);
  const { grantId } = await ok.json();
  const row = await prisma.commandGrant.findUniqueOrThrow({ where: { id: grantId } });
  assert.equal(row.policyVersion, COMMAND_POLICY_VERSION);
  assert.ok(await prisma.auditEvent.findFirst({ where: { businessId: shop.id, action: "command.grant_issued", entityId: grantId } }));
  const del = await grantsRoute.DELETE(new Request(`http://local.test/api/command/grants?id=${grantId}`, { method: "DELETE" }));
  assert.equal(del.status, 200);
  assert.ok((await prisma.commandGrant.findUniqueOrThrow({ where: { id: grantId } })).revokedAt, "revoked, kept");
  signedInAs = null;
});

test.after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});
