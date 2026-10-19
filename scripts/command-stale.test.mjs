#!/usr/bin/env node
/*
 * Plans approved inside the 12-hour window are still rechecked when they run.
 * The window bounds how old the picture the approver saw may be; eligibility
 * (the lead, the technician, the approver's grant, the proposer) is read again
 * at execution. Each stale plan below is one hour old and is refused with
 * nothing changed and the plan left for a person to redo.
 */
import assert from "node:assert/strict";
import test from "node:test";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY", "STRIPE_SECRET_KEY"]) delete process.env[key];

const { executeProposal, PROPOSAL_FRESH_MS } = await import("../src/lib/copilot-execute.ts");
const { COMMAND_POLICY_VERSION, grantEffect } = await import("../src/lib/command-authority.ts");
const { prisma } = await import("../src/lib/prisma.ts");

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const HOUR_AGO = () => new Date(Date.now() - 60 * 60_000);

test.after(async () => {
  await prisma.$disconnect();
});

async function shop() {
  const ownerEmail = `owner-${uid()}@example.test`;
  const business = await prisma.business.create({
    data: { name: "Stale HVAC", slug: `stale-${uid()}`, environment: "test", trade: "HVAC", billingStatus: "active", billingPlan: "pro", ownerEmail, hoursJson: "{}", servicesJson: "[]", timezone: "America/Chicago" },
  });
  const manager = `manager-${uid()}@example.test`;
  await prisma.membership.create({ data: { businessId: business.id, email: manager, role: "manager" } });
  return { business, ownerEmail, manager };
}

const plan = (businessId, action, params, proposedByEmail = null) =>
  prisma.copilotAction.create({ data: { businessId, action, paramsJson: JSON.stringify(params), preview: action, status: "proposed", proposedByEmail, createdAt: HOUR_AGO() } });

async function refusedUnchanged(out, proposalId, reason) {
  assert.ok(HOUR_AGO().getTime() > Date.now() - PROPOSAL_FRESH_MS, "inside the 12-hour window");
  assert.equal(out.ok, false);
  assert.equal(out.reason, reason, out.error);
  assert.match(out.error, /Nothing was changed|not found or inactive|grant/);
  const row = await prisma.copilotAction.findUniqueOrThrow({ where: { id: proposalId } });
  assert.equal(row.status, "proposed", "left for a fresh decision, not executed or flagged");
  assert.equal(row.executedAt, null);
}

test("follow-up text: the lead was booked after the plan was made", async () => {
  const { business, ownerEmail } = await shop();
  const lead = await prisma.lead.create({ data: { businessId: business.id, phone: "+15550007001", name: "Rae", status: "new" } });
  const p = await plan(business.id, "sms_followup", { leadId: lead.id });
  await prisma.lead.update({ where: { id: lead.id }, data: { status: "booked" } });
  const out = await executeProposal({ business, proposalId: p.id, by: { role: "owner", email: ownerEmail } });
  await refusedUnchanged(out, p.id, "lead_moved_on");
});

test("mark contacted: the lead was marked lost after the plan was made", async () => {
  const { business, ownerEmail } = await shop();
  const lead = await prisma.lead.create({ data: { businessId: business.id, phone: "+15550007002", name: "Sam", status: "new" } });
  const p = await plan(business.id, "mark_contacted", { leadId: lead.id });
  await prisma.lead.update({ where: { id: lead.id }, data: { status: "lost" } });
  const out = await executeProposal({ business, proposalId: p.id, by: { role: "owner", email: ownerEmail } });
  await refusedUnchanged(out, p.id, "lead_moved_on");
  assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, "lost");
});

test("assign tech: the technician was deactivated after the plan was made", async () => {
  const { business, ownerEmail } = await shop();
  const tech = await prisma.technician.create({ data: { businessId: business.id, name: "Lee", skillsJson: "[]" } });
  const job = await prisma.job.create({ data: { businessId: business.id, title: "No heat", status: "scheduled" } });
  const p = await plan(business.id, "assign_tech", { jobId: job.id, technicianId: tech.id });
  await prisma.technician.update({ where: { id: tech.id }, data: { isActive: false } });
  const out = await executeProposal({ business, proposalId: p.id, by: { role: "owner", email: ownerEmail } });
  assert.equal(out.ok, false);
  assert.equal(out.status, 404);
  assert.equal((await prisma.job.findUnique({ where: { id: job.id } })).technicianId, null);
  assert.equal((await prisma.copilotAction.findUnique({ where: { id: p.id } })).status, "proposed");
});

test("approver's grant revoked after the plan was made: refused at execution", async () => {
  const { business, ownerEmail, manager } = await shop();
  const lead = await prisma.lead.create({ data: { businessId: business.id, phone: "+15550007003", name: "Kim", status: "new" } });
  const grant = await prisma.commandGrant.create({
    data: { businessId: business.id, granteeEmail: manager, action: "mark_contacted", effect: grantEffect("mark_contacted").effect, expiresAt: new Date(Date.now() + 86_400_000), policyVersion: COMMAND_POLICY_VERSION, grantedByEmail: ownerEmail },
  });
  const p = await plan(business.id, "mark_contacted", { leadId: lead.id }, ownerEmail);
  await prisma.commandGrant.update({ where: { id: grant.id }, data: { revokedAt: new Date(), revokedByEmail: ownerEmail } });
  const out = await executeProposal({ business, proposalId: p.id, by: { role: "manager", email: manager } });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "no_command_authority");
  assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, "new");
  assert.equal((await prisma.copilotAction.findUnique({ where: { id: p.id } })).status, "proposed");
});

test("proposer removed from the team after asking: the plan doesn't run, even for the owner", async () => {
  const { business, ownerEmail, manager } = await shop();
  const lead = await prisma.lead.create({ data: { businessId: business.id, phone: "+15550007004", name: "Ana", status: "new" } });
  const p = await plan(business.id, "mark_contacted", { leadId: lead.id }, manager);
  await prisma.membership.delete({ where: { businessId_email: { businessId: business.id, email: manager } } });
  const out = await executeProposal({ business, proposalId: p.id, by: { role: "owner", email: ownerEmail } });
  await refusedUnchanged(out, p.id, "proposer_removed");
  assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, "new");
});

test("control: the same fresh plan with nothing changed does run", async () => {
  const { business, ownerEmail, manager } = await shop();
  const lead = await prisma.lead.create({ data: { businessId: business.id, phone: "+15550007005", name: "Bo", status: "new" } });
  const p = await plan(business.id, "mark_contacted", { leadId: lead.id }, manager);
  const out = await executeProposal({ business, proposalId: p.id, by: { role: "owner", email: ownerEmail } });
  assert.equal(out.ok, true, out.error);
  assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, "contacted");
});
