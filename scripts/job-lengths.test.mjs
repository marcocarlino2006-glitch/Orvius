#!/usr/bin/env node
/*
 * Job lengths: a shop that says a tune-up takes 45 minutes gets 45-minute
 * holds on live calls, and the settings API only stores lengths from the list.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

delete process.env.RESEND_API_KEY;

const nextServer = await import("next/server");
mock.module("next/server", {
  namedExports: { ...nextServer, after: () => {} },
});

let signedInAs = null;
mock.module(new URL("../src/auth.ts", import.meta.url).href, {
  namedExports: {
    auth: async () => (signedInAs ? { user: { email: signedInAs } } : null),
    signIn: async () => {},
    signOut: async () => {},
    handlers: {},
  },
});

const { classifyRequest, jobLengthLabel, jobLengthServices, parseJobLengths, validateJobLengths } = await import(
  "../src/lib/trade-playbooks.ts"
);
const { handleInCallToolCalls } = await import("../src/lib/in-call-tools.ts");
const { prisma } = await import("../src/lib/prisma.ts");

const made = [];
const uid = () => Math.random().toString(36).slice(2, 10);

test.after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

test("lengths parse only known jobs and listed values", () => {
  assert.deepEqual(parseJobLengths(null), {});
  assert.deepEqual(parseJobLengths("[]"), {});
  assert.deepEqual(parseJobLengths("nope"), {});
  assert.deepEqual(parseJobLengths(JSON.stringify({ tune_up: 45, made_up: 60, drain_clog: 37, sewer: 240 })), {
    tune_up: 45,
    sewer: 240,
  });
});

test("the API check refuses unknown jobs and odd lengths in plain words", () => {
  assert.match(validateJobLengths("[1]").error, /couldn't be read/);
  assert.match(validateJobLengths(JSON.stringify({ hack: 60 })).error, /isn't on the list/);
  assert.match(validateJobLengths(JSON.stringify({ tune_up: 7 })).error, /from the list/);
  assert.deepEqual(validateJobLengths(JSON.stringify({ tune_up: 45 })), { ok: true, json: '{"tune_up":45}' });
});

test("labels read like a person would say them", () => {
  assert.equal(jobLengthLabel(45), "45 min");
  assert.equal(jobLengthLabel(60), "1 hr");
  assert.equal(jobLengthLabel(90), "1.5 hrs");
  assert.equal(jobLengthLabel(240), "4 hrs");
});

test("the settings list is the shop's trade jobs plus its catch-all, with defaults", () => {
  const hvac = jobLengthServices({ trade: "HVAC" });
  assert.ok(hvac.some((s) => s.key === "tune_up" && s.defaultMin === 60));
  assert.equal(hvac.at(-1).key, "hvac_diagnostic");
  assert.ok(jobLengthServices({ trade: "Plumbing" }).some((s) => s.key === "sewer" && s.defaultMin === 180));
  assert.deepEqual(jobLengthServices({ trade: null, name: "Acme" }), []);
});

test("the shop's length wins over the playbook and an old services override", () => {
  const standard = classifyRequest({ business: { trade: "HVAC" }, serviceType: "AC tune-up" });
  assert.equal(standard.service.key, "tune_up");
  assert.equal(standard.service.durationMin, 60);

  const own = classifyRequest({
    business: {
      trade: "HVAC",
      servicesJson: JSON.stringify([{ name: "Maintenance tune-up", durationMin: 90 }]),
      jobLengthsJson: JSON.stringify({ tune_up: 45 }),
    },
    serviceType: "AC tune-up",
  });
  assert.equal(own.service.durationMin, 45);
  assert.ok(own.reasons.some((r) => /Shop sets Maintenance tune-up at 45 min/.test(r)));

  const other = classifyRequest({
    business: { trade: "HVAC", jobLengthsJson: JSON.stringify({ tune_up: 45 }) },
    serviceType: "my thermostat is blank",
  });
  assert.equal(other.service.durationMin, 60);
});

test("a live call holds the shop's length, not the default", async () => {
  const serviceType = "AC tune-up";
  const shop = await prisma.business.create({
    data: {
      name: "Length Heating",
      slug: `length-${Date.now()}-${uid()}`,
      environment: "test",
      trade: "HVAC",
      hoursJson: "{}",
      timezone: "America/Chicago",
      servicesJson: "[]",
      jobLengthsJson: JSON.stringify({ tune_up: 45 }),
    },
  });
  made.push(shop.id);
  await prisma.technician.create({ data: { businessId: shop.id, name: "Tech", phone: "+15550004444", skillsJson: "[]" } });
  const call = await prisma.call.create({ data: { businessId: shop.id, vapiCallId: `len_${uid()}`, status: "in-progress" } });
  const forTools = {
    id: shop.id,
    name: shop.name,
    hoursJson: shop.hoursJson,
    timezone: shop.timezone,
    trade: shop.trade,
    servicesJson: shop.servicesJson,
    jobLengthsJson: shop.jobLengthsJson,
  };
  const [offer] = await handleInCallToolCalls({
    shop: forTools,
    callId: call.id,
    toolCalls: [{ id: "c", name: "check_availability", args: { serviceType } }],
  });
  const slot = offer.result.match(/\[slot ([^\]]+)\]/)?.[1];
  assert.ok(slot, offer.result);
  const [held] = await handleInCallToolCalls({
    shop: forTools,
    callId: call.id,
    toolCalls: [{ id: "h", name: "hold_appointment", args: { slot, serviceType } }],
  });
  assert.match(held.result, /^Held /, held.result);
  const row = await prisma.call.findUnique({ where: { id: call.id } });
  assert.equal(row.heldSlotDurationMin, 45);
});

function patch(body) {
  return new Request("http://localhost/api/account", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("settings save job lengths and refuse bad ones", async () => {
  const { GET, PATCH } = await import("../src/app/api/account/route.ts");
  const shop = await prisma.business.create({
    data: {
      name: `Lengths ${uid()}`,
      slug: `lengths-${Date.now()}-${uid()}`,
      environment: "test",
      trade: "Plumbing",
      ownerEmail: `owner-${uid()}@example.test`,
      billingStatus: "active",
      billingPlan: "pro",
    },
  });
  made.push(shop.id);
  signedInAs = shop.ownerEmail;
  try {
    const saved = await PATCH(patch({ jobLengthsJson: JSON.stringify({ drain_clog: 45, sewer: 240 }) }));
    assert.equal(saved.status, 200, await saved.clone().text());
    const row = await prisma.business.findUnique({ where: { id: shop.id } });
    assert.deepEqual(JSON.parse(row.jobLengthsJson), { drain_clog: 45, sewer: 240 });

    const read = await (await GET(new Request("http://localhost/api/account"))).json();
    assert.match((read.business ?? read).jobLengthsJson, /drain_clog/);

    const bad = await PATCH(patch({ jobLengthsJson: JSON.stringify({ drain_clog: 13 }) }));
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).error, /from the list/);
    assert.deepEqual(JSON.parse((await prisma.business.findUnique({ where: { id: shop.id } })).jobLengthsJson), {
      drain_clog: 45,
      sewer: 240,
    });
  } finally {
    signedInAs = null;
  }
});
