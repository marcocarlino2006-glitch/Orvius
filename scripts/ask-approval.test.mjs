#!/usr/bin/env node
/*
 * Ask explains, recommends one action, and advances work only on approval —
 * exactly once, re-checked at run time, confirmed by an audit event.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const baseUrl =
  process.env.DATABASE_URL ??
  readFileSync(new URL("../.env", import.meta.url), "utf8").match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
if (baseUrl?.startsWith("file:") && !baseUrl.includes("socket_timeout")) {
  process.env.DATABASE_URL = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}connection_limit=1&socket_timeout=60`;
}
for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "RESEND_API_KEY"]) {
  delete process.env[key];
}

const { buildAskBrief } = await import("../src/lib/ask-brief.ts");
const { executeProposal } = await import("../src/lib/copilot-execute.ts");

const prisma = new PrismaClient();
const uid = () => Math.random().toString(36).slice(2, 10);
const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});
const tomorrowAt = (hour) => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d;
};

async function makeShop() {
  return prisma.business.create({
    data: {
      name: "Ask Test HVAC",
      slug: `ask-${Date.now()}-${uid()}`,
      environment: "test",
      trade: "HVAC",
      billingStatus: "active",
      billingPlan: "pro",
    },
  });
}

async function unassignedJob(businessId, overrides = {}) {
  return prisma.job.create({
    data: {
      businessId,
      title: "AC not cooling",
      serviceType: "AC not cooling",
      urgency: "same-day",
      address: "12 Oak St",
      status: "scheduled",
      scheduledAt: tomorrowAt(10),
      durationMin: 120,
      ...overrides,
    },
  });
}

const hit = (type, id) => ({
  type,
  id,
  href: `/dashboard/${type}s`,
  title: id,
  summary: "",
  score: 1,
  observedAt: new Date().toISOString(),
});

function propose(businessId, action, params) {
  return prisma.copilotAction.create({
    data: { businessId, action, paramsJson: JSON.stringify(params), preview: `${action} preview`, status: "proposed" },
  });
}

test("brief cites the job, recommends the skilled technician, and approval runs once with an audit", async () => {
  const shop = await makeShop();
  try {
    await prisma.technician.create({ data: { businessId: shop.id, name: "Ben Heating", skillsJson: '["heating"]' } });
    const ana = await prisma.technician.create({
      data: { businessId: shop.id, name: "Ana Cooling", skillsJson: '["cooling"]' },
    });
    const job = await unassignedJob(shop.id);

    const brief = await buildAskBrief({ businessId: shop.id, hits: [hit("job", job.id)], modelWorded: false });
    assert.equal(brief.recommendation?.action, "assign_tech");
    assert.equal(brief.recommendation?.technicianId, ana.id);
    assert.equal(brief.recommendation?.recordId, job.id);
    assert.match(brief.recommendation.reason, /cooling skill/);
    assert.ok(brief.matters.some((m) => /has no technician/.test(m)));

    const proposal = await propose(shop.id, "assign_tech", { jobId: job.id, technicianId: ana.id });
    const runs = await Promise.all(
      Array.from({ length: 5 }, () => executeProposal({ business: shop, proposalId: proposal.id })),
    );
    assert.equal(runs.filter((r) => r.ok).length, 1, "approval must run exactly once");
    const ok = runs.find((r) => r.ok);
    assert.match(ok.confirmation.summary, /Assigned Ana Cooling/);
    assert.ok(ok.confirmation.auditId);

    const after = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(after.technicianId, ana.id);
    const audits = await prisma.auditEvent.findMany({ where: { jobId: job.id, action: "copilot.executed" } });
    assert.equal(audits.length, 1);
    assert.equal(audits[0].actor, "owner");

    const quiet = await buildAskBrief({ businessId: shop.id, hits: [hit("job", job.id)], modelWorded: false });
    assert.equal(quiet.recommendation, null, "nothing left to recommend once assigned");
  } finally {
    await drop(shop.id);
  }
});

test("approval re-checks the calendar and refuses a technician who became busy", async () => {
  const shop = await makeShop();
  try {
    const ana = await prisma.technician.create({
      data: { businessId: shop.id, name: "Ana Cooling", skillsJson: '["cooling"]' },
    });
    const job = await unassignedJob(shop.id);
    const proposal = await propose(shop.id, "assign_tech", { jobId: job.id, technicianId: ana.id });
    await unassignedJob(shop.id, { title: "Other job", technicianId: ana.id, scheduledAt: tomorrowAt(11) });

    const outcome = await executeProposal({ business: shop, proposalId: proposal.id });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.reason, "technician_busy");
    assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).technicianId, null);
    assert.equal((await prisma.copilotAction.findUniqueOrThrow({ where: { id: proposal.id } })).status, "proposed");
    assert.equal(await prisma.auditEvent.count({ where: { jobId: job.id, action: "copilot.executed" } }), 0);
  } finally {
    await drop(shop.id);
  }
});

test("a waiting lead gets one follow-up recommendation; failed SMS changes nothing", async () => {
  const shop = await makeShop();
  try {
    const lead = await prisma.lead.create({
      data: {
        businessId: shop.id,
        name: "Sam Ortiz",
        phone: "+13125550177",
        serviceType: "Furnace noise",
        status: "new",
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
      },
    });
    const brief = await buildAskBrief({ businessId: shop.id, hits: [hit("lead", lead.id)], modelWorded: true });
    assert.equal(brief.recommendation?.action, "sms_followup");
    assert.match(brief.recommendation.reason, /5 hours/);
    assert.ok(brief.uncertainty.some((u) => /generated/.test(u)));

    const sms = await propose(shop.id, "sms_followup", { leadId: lead.id });
    const failed = await executeProposal({ business: shop, proposalId: sms.id });
    assert.equal(failed.ok, false, "no Twilio in tests, so the text cannot send");
    assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status, "new");
    assert.equal((await prisma.copilotAction.findUniqueOrThrow({ where: { id: sms.id } })).status, "proposed");

    const mark = await propose(shop.id, "mark_contacted", { leadId: lead.id });
    const done = await executeProposal({ business: shop, proposalId: mark.id });
    assert.equal(done.ok, true);
    assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status, "contacted");
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { leadId: lead.id, action: "copilot.executed" } });
    assert.equal(audit.actor, "owner");
  } finally {
    await drop(shop.id);
  }
});

test("an emergency lead is told to call, not text, ahead of older routine leads", async () => {
  const shop = await makeShop();
  try {
    const routine = await prisma.lead.create({
      data: {
        businessId: shop.id,
        name: "Old Routine",
        phone: "+13125550178",
        serviceType: "Tune-up",
        status: "new",
        createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
      },
    });
    const gas = await prisma.lead.create({
      data: {
        businessId: shop.id,
        name: "Gas Smell",
        phone: "+13125550179",
        serviceType: "I smell gas near the furnace",
        urgency: "emergency",
        status: "new",
        createdAt: new Date(Date.now() - 20 * 60 * 1000),
      },
    });
    const brief = await buildAskBrief({
      businessId: shop.id,
      hits: [hit("lead", routine.id), hit("lead", gas.id)],
      modelWorded: false,
    });
    assert.equal(brief.recommendation?.action, "call");
    assert.equal(brief.recommendation?.leadId, gas.id);
    assert.equal(brief.recommendation?.phone, gas.phone);
  } finally {
    await drop(shop.id);
  }
});

test("no records means an explicit uncertainty and no recommendation", async () => {
  const shop = await makeShop();
  try {
    const brief = await buildAskBrief({ businessId: shop.id, hits: [], modelWorded: false });
    assert.equal(brief.recommendation, null);
    assert.match(brief.uncertainty[0], /No individual records/);
  } finally {
    await drop(shop.id);
  }
});

test("another workspace cannot run, or be recommended, a proposal it does not own", async () => {
  const a = await makeShop();
  const b = await makeShop();
  try {
    const tech = await prisma.technician.create({ data: { businessId: a.id, name: "Ana", skillsJson: "[]" } });
    const job = await unassignedJob(a.id);
    const proposal = await propose(a.id, "assign_tech", { jobId: job.id, technicianId: tech.id });

    const foreign = await executeProposal({ business: b, proposalId: proposal.id });
    assert.equal(foreign.ok, false);
    assert.equal(foreign.status, 404);
    assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).technicianId, null);

    const brief = await buildAskBrief({ businessId: b.id, hits: [hit("job", job.id)], modelWorded: false });
    assert.equal(brief.recommendation, null);
  } finally {
    await drop(a.id);
    await drop(b.id);
  }
});

test.after(() => prisma.$disconnect());
