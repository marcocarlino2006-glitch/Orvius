/*
 * Recovery and routing guards. A line or receptionist that two live shops
 * claim reaches neither shop rather than the wrong one. A technician's job
 * text whose send failed, died mid-send, or whose reply was lost is recovered
 * without a second text. Asking Command twice for the same thing is one plan.
 * Two setup saves at once both land. No providers: texts go through the
 * simulated carrier of a test-mode shop and the voice provider's call list is
 * a stub.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY", "STRIPE_SECRET_KEY", "VAPI_API_KEY"]) {
  delete process.env[key];
}

const { prisma } = await import("../src/lib/prisma.ts");
const { pickTenant, resolveBusinessByInboundPhone, resolveBusinessForInboundSms } = await import("../src/lib/resolve-shop-line.ts");
const { recoverLostCallsAccountWide } = await import("../src/lib/line-watch.ts");
const { DEMO_LINE_TEL } = await import("../src/lib/demo-line.ts");
const { sweepUntoldAssignments, notifyTechOnAssign, UNTOLD_GRACE_MS } = await import("../src/lib/notify-tech-assign.ts");
const { claimIntent } = await import("../src/lib/sms-intent.ts");
const { proposeAction } = await import("../src/lib/copilot-propose.ts");
const { executeProposal } = await import("../src/lib/copilot-execute.ts");
const { describeReadBack, readReadBack } = await import("../src/lib/plan-reply.ts");
const { startSetup, saveSetupLiveDraft, saveSetupGoal, setSetupStep, findSetupSandbox } = await import("../src/lib/setup-sandbox.ts");
const { parseSetup, SETUP_GOALS } = await import("../src/lib/setup-flow.ts");

const uid = () => Math.random().toString(36).slice(2, 10);
const line = () => `+1555${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

async function shop(overrides = {}) {
  const tag = uid();
  return prisma.business.create({
    data: {
      name: `Guard ${tag}`,
      slug: `guard-${tag}`,
      environment: "test",
      trade: "HVAC",
      timezone: "America/Chicago",
      ownerEmail: `guard-${tag}@example.test`,
      ownerPhone: "+13125550190",
      billingStatus: "active",
      billingPlan: "pro",
      ...overrides,
    },
  });
}

/* ---------------- tenant routing ---------------- */

test("pickTenant: one live shop wins a collision, only-test collisions keep the oldest, two live shops get nobody, the demo line stays with the demo shop", () => {
  const at = (m) => new Date(Date.UTC(2026, 0, 1, 0, m));
  const live1 = { id: "live1", slug: "a", name: "A", environment: "production", createdAt: at(2) };
  const live2 = { id: "live2", slug: "b", name: "B", environment: "production", createdAt: at(3) };
  const test1 = { id: "test1", slug: "c", name: "C", environment: "test", createdAt: at(1) };
  const test2 = { id: "test2", slug: "d", name: "D", environment: "test", createdAt: at(4) };
  const demo = { id: "demo", slug: "summit-hvac", name: "Summit HVAC", environment: "demo", createdAt: at(5) };

  assert.equal(pickTenant([], { kind: "line", key: "+15550000001" }), null);
  assert.equal(pickTenant([live1], { kind: "line", key: "+15550000001" })?.id, "live1");
  assert.equal(pickTenant([test1, live1], { kind: "line", key: "+15550000001" })?.id, "live1");
  assert.equal(pickTenant([test2, test1], { kind: "line", key: "+15550000001" })?.id, "test1");
  assert.equal(pickTenant([live1, live2, test1], { kind: "line", key: "+15550000001" }), null);
  assert.equal(pickTenant([live1, live2], { kind: "assistant", key: "asst-x" }), null);
  assert.equal(pickTenant([live1, demo], { kind: "line", key: DEMO_LINE_TEL })?.id, "demo");
  assert.equal(pickTenant([live1, demo], { kind: "line", key: "+15550000001" })?.id, "live1", "off the demo line, the customer shop wins");
});

test("a line two live shops share reaches neither; a live shop sharing with a test shop keeps its calls", async () => {
  const shared = line();
  const a = await shop({ environment: "production", twilioPhone: shared, vapiPhoneNumber: shared });
  const b = await shop({ environment: "production", twilioPhone: shared, vapiPhoneNumber: shared });
  const own = line();
  const live = await shop({ environment: "production", vapiPhoneNumber: own });
  const sandbox = await shop({ environment: "test", vapiPhoneNumber: own });
  try {
    assert.equal(await resolveBusinessByInboundPhone(shared), null, "ambiguous: nobody, not the oldest");
    assert.equal(await resolveBusinessForInboundSms({ to: shared, from: "+13125550999" }), null);
    assert.equal((await resolveBusinessByInboundPhone(own))?.id, live.id);
    const picked = await resolveBusinessByInboundPhone(own);
    assert.equal(picked.environment, "production");
    assert.equal(typeof picked.slug, "string");
  } finally {
    await prisma.business.deleteMany({ where: { id: { in: [a.id, b.id, live.id, sandbox.id] } } });
  }
});

test("lost-call recovery skips a receptionist two live shops share instead of filing the caller in either", async () => {
  const assistantId = `asst-shared-${uid()}`;
  const a = await shop({ environment: "production", vapiAssistantId: assistantId });
  const b = await shop({ environment: "production", vapiAssistantId: assistantId });
  const now = new Date();
  const ended = new Date(now.getTime() - 30 * 60_000).toISOString();
  const lost = { id: `call-${uid()}`, assistantId, type: "inboundPhoneCall", status: "ended", createdAt: ended, endedAt: ended, customer: { number: "+13125550888" } };
  try {
    const result = await recoverLostCallsAccountWide({ now, list: async () => [lost] });
    assert.equal(result.lost, 1);
    assert.equal(result.unmatched, 1);
    assert.deepEqual(result.recovered, []);
    assert.equal(await prisma.call.count({ where: { vapiCallId: lost.id } }), 0);
  } finally {
    await prisma.business.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  }
});

test("the voice webhook and line watch route by assistant through the same collision rule", () => {
  const webhook = read("src/app/api/webhooks/vapi/route.ts");
  assert.match(webhook, /pickTenant\(\s*await prisma\.business\.findMany\(\{\s*where: \{ vapiAssistantId: assistantId/);
  assert.doesNotMatch(webhook, /business\.findFirst\(\{\s*where: \{ vapiAssistantId/);
  assert.match(read("src/lib/line-watch.ts"), /pickTenant\(shops\.filter/);
});

/* ---------------- technician job texts ---------------- */

async function assignedJob(minutesAgo = 10) {
  const s = await shop({ setupJson: JSON.stringify({ sandbox: true }) });
  const tech = await prisma.technician.create({ data: { businessId: s.id, name: "Dana", phone: `+1312555${String(Math.floor(Math.random() * 9000) + 1000)}` } });
  const assignedAt = new Date(Date.now() - minutesAgo * 60_000);
  const job = await prisma.job.create({
    data: {
      businessId: s.id,
      title: "No cooling",
      status: "scheduled",
      scheduledAt: new Date(Date.now() + 2 * 86_400_000),
      technicianId: tech.id,
      techAssignedAt: assignedAt,
    },
  });
  return { s, tech, job };
}
const sendsTo = (s, tech) => prisma.outboundSms.count({ where: { businessId: s.id, toNormalized: tech.phone } });
const intentFor = (s, job, tech, data) =>
  prisma.smsIntent.create({
    data: {
      businessId: s.id,
      eventType: "job.tech_assigned",
      eventId: `${job.id}:${tech.id}@${job.scheduledAt.toISOString()}`,
      recipientNormalized: tech.phone,
      audience: "tech",
      severity: "severe",
      ...data,
    },
  });

test("a job text that never went out is sent by the sweep once, and the job is stamped", async () => {
  const { s, tech, job } = await assignedJob();
  try {
    const first = await sweepUntoldAssignments();
    assert.ok(first.sent >= 1);
    assert.ok((await prisma.job.findUnique({ where: { id: job.id } })).techNotifiedAt);
    assert.equal(await sendsTo(s, tech), 1);
    await sweepUntoldAssignments();
    assert.equal(await sendsTo(s, tech), 1, "a second sweep sends nothing");
  } finally {
    await prisma.business.delete({ where: { id: s.id } });
  }
});

test("response lost after the carrier took the text: the sweep stamps the job and sends nothing", async () => {
  const { s, tech, job } = await assignedJob();
  try {
    await intentFor(s, job, tech, { status: "submitted", providerSid: `SIM_${uid()}` });
    await sweepUntoldAssignments();
    assert.ok((await prisma.job.findUnique({ where: { id: job.id } })).techNotifiedAt);
    assert.equal(await sendsTo(s, tech), 0);
  } finally {
    await prisma.business.delete({ where: { id: s.id } });
  }
});

test("restart mid-send: the dead lease closes as unknown with one owner exception, and the text is never resent", async () => {
  const { s, tech, job } = await assignedJob();
  try {
    const row = await intentFor(s, job, tech, { status: "leased", leaseUntil: new Date(Date.now() - 60_000) });
    await sweepUntoldAssignments();
    await sweepUntoldAssignments();
    const after = await prisma.smsIntent.findUnique({ where: { id: row.id } });
    assert.equal(after.status, "unknown_submission");
    assert.ok(after.exceptionRaisedAt);
    assert.equal(await prisma.auditEvent.count({ where: { businessId: s.id, action: "sms.delivery_exception", entityId: row.id } }), 1);
    assert.equal(await sendsTo(s, tech), 0);
    assert.equal((await prisma.job.findUnique({ where: { id: job.id } })).techNotifiedAt, null, "not called told");
  } finally {
    await prisma.business.delete({ where: { id: s.id } });
  }
});

test("a text closed as refused or unknown is left to the owner, not retried", async () => {
  const { s, tech, job } = await assignedJob();
  try {
    await intentFor(s, job, tech, { status: "unknown_submission" });
    const result = await sweepUntoldAssignments();
    assert.ok(result.unsent >= 1);
    assert.equal(await sendsTo(s, tech), 0);
  } finally {
    await prisma.business.delete({ where: { id: s.id } });
  }
});

test("the sweep waits out the assign request's own send", async () => {
  const { s, tech } = await assignedJob(0);
  try {
    assert.ok(UNTOLD_GRACE_MS >= 60_000);
    await sweepUntoldAssignments();
    assert.equal(await sendsTo(s, tech), 0);
  } finally {
    await prisma.business.delete({ where: { id: s.id } });
  }
});

test("any send path that finds a dead lease raises the owner exception", async () => {
  const s = await shop();
  try {
    const key = { eventType: "job.tech_assigned", eventId: `j-${uid()}`, severity: "severe" };
    const row = await prisma.smsIntent.create({
      data: { businessId: s.id, ...key, recipientNormalized: "+13125550177", audience: "tech", status: "leased", leaseUntil: new Date(Date.now() - 1000) },
    });
    const claim = await claimIntent({ businessId: s.id, to: "+13125550177", audience: "tech", intent: key });
    assert.equal(claim.kind, "closed");
    assert.equal(await prisma.auditEvent.count({ where: { businessId: s.id, action: "sms.delivery_exception", entityId: row.id } }), 1);
  } finally {
    await prisma.business.delete({ where: { id: s.id } });
  }
});

test("taken off a job and put back on: the technician gets a fresh job text, not a stamp from the old one", async () => {
  const { s, tech, job } = await assignedJob();
  const other = await prisma.technician.create({ data: { businessId: s.id, name: "Lee", phone: "+13125550161" } });
  try {
    await prisma.job.update({ where: { id: job.id }, data: { technicianId: null, techAssignedAt: null } });
    const step = async (prev, next) => {
      await prisma.job.update({ where: { id: job.id }, data: { technicianId: next } });
      const r = await notifyTechOnAssign({ jobId: job.id, previousTechnicianId: prev, nextTechnicianId: next });
      await new Promise((resolve) => setTimeout(resolve, 5));
      return r;
    };
    assert.equal((await step(null, tech.id)).sent, true);
    assert.equal((await step(tech.id, other.id)).sent, true);
    assert.equal((await step(other.id, tech.id)).sent, true);
    assert.equal(await sendsTo(s, tech), 2, "back on the job is a new ask with a new link");
  } finally {
    await prisma.business.delete({ where: { id: s.id } });
  }
});

test("both drains run the job-text sweep", () => {
  assert.match(read("src/lib/drain-owner-alerts.ts"), /sweepUntoldAssignments\(\)/);
  assert.match(read("src/app/api/cron/notifications/route.ts"), /step\("untold_assignments", \(\) => sweepUntoldAssignments\(\)\)/);
});

/* ---------------- Command twins ---------------- */

async function leadShop() {
  const s = await shop();
  const lead = await prisma.lead.create({ data: { businessId: s.id, name: "Rosa Diaz", phone: "+13125550147", status: "new" } });
  return { s, lead };
}

test("asking Command twice for the same thing hands back the waiting plan instead of a second one", async () => {
  const { s, lead } = await leadShop();
  try {
    const first = await proposeAction(s, { action: "mark_contacted", leadId: lead.id });
    const second = await proposeAction(s, { action: "mark_contacted", leadId: lead.id });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(second.proposalId, first.proposalId);
    assert.equal(second.reused, true);
    assert.equal(await prisma.copilotAction.count({ where: { businessId: s.id } }), 1);
  } finally {
    await prisma.business.delete({ where: { id: s.id } });
  }
});

test("a twin that is running or stopped partway blocks a new copy and the approval of an old copy", async () => {
  const { s, lead } = await leadShop();
  try {
    const paramsJson = JSON.stringify({ leadId: lead.id });
    const waiting = await prisma.copilotAction.create({ data: { businessId: s.id, action: "mark_contacted", paramsJson, preview: "Mark", status: "proposed" } });
    const running = await prisma.copilotAction.create({ data: { businessId: s.id, action: "mark_contacted", paramsJson, preview: "Mark", status: "executing" } });

    const asked = await proposeAction(s, { action: "mark_contacted", leadId: lead.id });
    assert.equal(asked.ok, false);
    assert.equal(asked.reason, "twin_running");

    const approved = await executeProposal({ business: s, proposalId: waiting.id, by: { role: "owner", email: s.ownerEmail } });
    assert.equal(approved.ok, false);
    assert.equal(approved.reason, "twin_running");
    assert.equal((await prisma.copilotAction.findUnique({ where: { id: waiting.id } })).status, "proposed", "nothing changed");
    assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, "new");

    await prisma.copilotAction.update({ where: { id: running.id }, data: { status: "reconcile" } });
    const flagged = await proposeAction(s, { action: "mark_contacted", leadId: lead.id });
    assert.equal(flagged.reason, "twin_needs_check");
  } finally {
    await prisma.business.delete({ where: { id: s.id } });
  }
});

test("once one copy runs, the other waiting copies are retired and read back as already done elsewhere", async () => {
  const { s, lead } = await leadShop();
  try {
    const paramsJson = JSON.stringify({ leadId: lead.id });
    const [one, two] = await Promise.all(
      [0, 1].map(() => prisma.copilotAction.create({ data: { businessId: s.id, action: "mark_contacted", paramsJson, preview: "Mark", status: "proposed" } })),
    );
    const ran = await executeProposal({ business: s, proposalId: one.id, by: { role: "owner", email: s.ownerEmail } });
    assert.equal(ran.ok, true);
    const other = await prisma.copilotAction.findUnique({ where: { id: two.id } });
    assert.equal(other.status, "superseded");
    assert.equal(JSON.parse(other.resultJson).supersededBy, one.id);

    const again = await executeProposal({ business: s, proposalId: two.id, by: { role: "owner", email: s.ownerEmail } });
    assert.equal(again.ok, false);

    const back = readReadBack({ proposal: { id: two.id, state: "superseded", preview: "Mark" }, outcome: null }, two.id);
    assert.equal(back?.state, "superseded");
    const said = describeReadBack("superseded");
    assert.equal(said.canApprove, false);
    assert.equal(said.settled, true);

    const fresh = await proposeAction(s, { action: "mark_contacted", leadId: lead.id });
    assert.equal(fresh.ok, true);
    assert.notEqual(fresh.proposalId, one.id, "after it ran, asking again is a new plan");
  } finally {
    await prisma.business.delete({ where: { id: s.id } });
  }
});

test("two copies approved at the same moment never both run, and neither is left running", async () => {
  const { s, lead } = await leadShop();
  try {
    const paramsJson = JSON.stringify({ leadId: lead.id });
    const copies = await Promise.all(
      [0, 1].map(() => prisma.copilotAction.create({ data: { businessId: s.id, action: "mark_contacted", paramsJson, preview: "Mark", status: "proposed" } })),
    );
    const results = await Promise.all(copies.map((c) => executeProposal({ business: s, proposalId: c.id, by: { role: "owner", email: s.ownerEmail } })));
    assert.ok(results.filter((r) => r.ok).length <= 1);
    assert.ok(await prisma.auditEvent.count({ where: { businessId: s.id, action: "copilot.executed" } }) <= 1);
    assert.equal(await prisma.copilotAction.count({ where: { businessId: s.id, status: "executing" } }), 0);
  } finally {
    await prisma.business.delete({ where: { id: s.id } });
  }
});

test("the plan readback names a retired copy", () => {
  assert.match(read("src/app/api/copilot/route.ts"), /item\.status === "superseded"\s*\?\s*"superseded"/);
});

/* ---------------- setup saves ---------------- */

async function sandbox() {
  const email = `setup-${uid()}@example.test`;
  await startSetup(email, { name: "Race Heating", trade: "HVAC" });
  return email;
}
const setupOf = async (email) => parseSetup((await findSetupSandbox(email)).setupJson);
const dropSandbox = async (email) => prisma.business.deleteMany({ where: { ownerEmail: email } });

test("two devices saving setup at once both keep what they saved", async () => {
  const email = await sandbox();
  try {
    const goal = SETUP_GOALS[0].id;
    await Promise.all([
      saveSetupLiveDraft(email, { ownerPhone: "+13125550123" }),
      saveSetupLiveDraft(email, { areaCode: "312" }),
      saveSetupGoal(email, goal),
    ]);
    const saved = await setupOf(email);
    assert.equal(saved.liveDraft?.ownerPhone, "+13125550123");
    assert.equal(saved.liveDraft?.areaCode, "312");
    assert.equal(saved.goal, goal);
    assert.ok(saved.done?.goal);
    assert.ok(saved.done?.business);
  } finally {
    await dropSandbox(email);
  }
});

test("a step save after a draft keeps the draft", async () => {
  const email = await sandbox();
  try {
    await saveSetupLiveDraft(email, { areaCode: "773" });
    await setSetupStep(email, "goal");
    assert.equal((await setupOf(email)).liveDraft?.areaCode, "773");
  } finally {
    await dropSandbox(email);
  }
});

test("setup writes compare and swap instead of overwriting from an earlier read", () => {
  const src = read("src/lib/setup-sandbox.ts");
  assert.match(src, /updateMany\(\{ where: \{ id: businessId, setupJson: row\.setupJson \}/);
  assert.doesNotMatch(src, /setupJson: mergeSetup\(business/);
});
