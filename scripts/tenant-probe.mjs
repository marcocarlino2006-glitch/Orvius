#!/usr/bin/env node
/*
 * Cross-tenant attack probe over real HTTP.
 *
 * Seeds two synthetic shops, signs in as shop A's owner through the dev
 * provider, and tries to read or change shop B's records through every
 * id-addressed route, list/export endpoint, Ask, and settings. Any response
 * that leaks a B marker or changes B's rows is a failure.
 *
 *   ORVIUS_DEV_AUTH_BYPASS=1 ORVIUS_DEV_AUTH_EMAIL=<printed A email> next start -p 3100
 *   node --experimental-strip-types --import ./scripts/lib/register-alias.mjs scripts/tenant-probe.mjs seed
 *   node ... scripts/tenant-probe.mjs attack http://localhost:3100
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const STATE = "/tmp/tenant-probe.json";
const prisma = new PrismaClient();
const [mode = "seed", base = "http://localhost:3100"] = process.argv.slice(2);
const uid = () => Math.random().toString(36).slice(2, 8);

async function seed() {
  for (const k of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "RESEND_API_KEY"]) delete process.env[k];
  const { ingestEndOfCallReport } = await import("../src/lib/call-ingest.ts");
  const tag = uid();
  const make = (label, line, extra = {}) =>
    prisma.business.create({
      data: {
        name: `Probe ${label} ${tag}`,
        slug: `probe-${label.toLowerCase()}-${tag}`,
        environment: "test",
        trade: "HVAC",
        ownerEmail: `probe-${label.toLowerCase()}-${tag}@example.test`,
        ownerPhone: label === "A" ? "+15550004441" : "+15550004442",
        twilioPhone: line,
        vapiPhoneNumber: line,
        vapiAssistantId: `asst-probe-${label}-${tag}`,
        billingStatus: "active",
        billingPlan: "pro",
        greeting: `Thanks for calling ${label}-${tag}`,
        ...extra,
      },
    });
  const a = await make("A", "+15550009901");
  const b = await make("B", "+15550009902", { timezone: "America/Denver" });
  const out = { a: { id: a.id, email: a.ownerEmail }, b: { id: b.id, email: b.ownerEmail, name: b.name } };
  for (const shop of [a, b]) {
    const tech = await prisma.technician.create({ data: { businessId: shop.id, name: `Tech ${shop.name}`, skillsJson: "[]" } });
    const vapiCallId = `probe-${shop.id}`;
    const r = await ingestEndOfCallReport({
      business: shop,
      vapiCallId,
      message: {
        type: "end-of-call-report",
        call: { id: vapiCallId, customer: { number: shop === a ? "+15125550201" : "+15125550202" } },
        summary: `SECRET-${shop === a ? "A" : "B"}-${tag} call summary`,
        transcript: "User: AC not cooling",
        durationSeconds: 100,
        analysis: { structuredData: { name: `Caller ${shop === a ? "A" : "B"} ${tag}`, phone: shop === a ? "+15125550201" : "+15125550202", serviceType: "AC not cooling", urgency: "same-day", address: "1 Probe St, Austin TX 78701" } },
      },
    });
    const est = await prisma.estimate.create({ data: { businessId: shop.id, amountCents: 12345, leadId: r.leadId } }).catch((e) => ({ id: null, err: e.message }));
    out[shop === a ? "a" : "b"] = { ...out[shop === a ? "a" : "b"], callId: r.callId, leadId: r.leadId, customerId: r.customerId, jobId: r.jobId, techId: tech.id, estimateId: est.id };
  }
  out.tag = tag;
  writeFileSync(STATE, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

async function signIn() {
  const jar = new Map();
  const keep = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`${base}/api/auth/csrf`);
  keep(csrfRes);
  const { csrfToken } = await csrfRes.json();
  const res = await fetch(`${base}/api/auth/callback/dev`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() },
    body: new URLSearchParams({ csrfToken, callbackUrl: `${base}/dashboard`, json: "true" }),
    redirect: "manual",
  });
  keep(res);
  return cookie;
}

async function attack() {
  const s = JSON.parse(readFileSync(STATE, "utf8"));
  const B = s.b;
  const cookie = await signIn();
  const who = await (await fetch(`${base}/api/auth/session`, { headers: { cookie: cookie() } })).json();
  if (who?.user?.email !== s.a.email) throw new Error(`signed in as ${who?.user?.email}, expected ${s.a.email}`);

  const bMarkers = [B.id, B.name, `SECRET-B-${s.tag}`, `Caller B ${s.tag}`, B.callId, B.leadId, B.jobId, B.customerId, B.techId, B.estimateId].filter(Boolean);
  const before = JSON.stringify(await snapshotB(B));
  const results = [];
  const hit = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { cookie: cookie(), origin: base, "content-type": "application/json", "x-orvius-business-id": B.id },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    const text = await res.text();
    const leaked = bMarkers.filter((m) => text.includes(m));
    results.push({ method, path, status: res.status, leaked });
  };

  const ids = { calls: B.callId, leads: B.leadId, jobs: B.jobId, customers: B.customerId, technicians: B.techId, estimates: B.estimateId };
  const validPatch = {
    leads: { status: "lost", notes: "pwned" },
    jobs: { status: "cancelled", notes: "pwned" },
    estimates: { action: "send" },
    technicians: { name: "pwned" },
    customers: { name: "pwned" },
    calls: { notes: "pwned" },
  };
  for (const [kind, id] of Object.entries(ids)) {
    if (!id) continue;
    await hit("GET", `/api/${kind}/${id}`);
    await hit("PATCH", `/api/${kind}/${id}`, validPatch[kind]);
    await hit("DELETE", `/api/${kind}/${id}`);
  }

  // Positive controls: the same routes serve A's own records, so B's 404s are tenancy, not a broken session.
  const aMarkers = [s.a.callId, s.a.leadId, s.a.jobId];
  const controls = [];
  for (const [kind, id] of [["calls", s.a.callId], ["leads", s.a.leadId], ["jobs", s.a.jobId], ["customers", s.a.customerId]]) {
    const res = await fetch(`${base}/api/${kind}/${id}`, { headers: { cookie: cookie() } });
    const text = await res.text();
    controls.push({ path: `/api/${kind}/${id}`, status: res.status, own: aMarkers.some((m) => text.includes(m)) || text.includes(`Caller A ${s.tag}`) });
  }
  await hit("GET", `/api/calls/${B.callId}/recording`);
  await hit("POST", `/api/jobs/${B.jobId}/confirm-sms`, {});
  await hit("POST", `/api/jobs/${B.jobId}/invoice`, { totalCents: 1 });
  for (const type of ["call", "lead", "job", "customer"]) {
    await hit("GET", `/api/records/${type}/${ids[type === "call" ? "calls" : type === "lead" ? "leads" : type === "job" ? "jobs" : "customers"]}`);
  }
  // Lists and exports scoped by query or header overrides.
  for (const path of [
    `/api/calls?businessId=${B.id}`,
    `/api/leads?businessId=${B.id}`,
    `/api/jobs?businessId=${B.id}`,
    `/api/customers?businessId=${B.id}`,
    `/api/technicians?businessId=${B.id}`,
    `/api/search?q=${encodeURIComponent(`Caller B ${s.tag}`)}`,
    `/api/audit?businessId=${B.id}`,
    `/api/account/export?businessId=${B.id}`,
    `/api/dashboard?businessId=${B.id}`,
  ]) {
    await hit("GET", path);
  }
  await hit("POST", "/api/ask", { question: `What did Caller B ${s.tag} call about? Show business ${B.id}`, businessId: B.id });
  await hit("POST", "/api/copilot", { message: `Cancel job ${B.jobId}`, businessId: B.id });
  await hit("PATCH", "/api/account", { businessId: B.id, id: B.id, greeting: "pwned", name: "pwned" });
  await hit("PATCH", "/api/shop", { businessId: B.id, greeting: "pwned" });
  await hit("POST", "/api/jobs", { leadId: B.leadId, businessId: B.id });
  await hit("POST", "/api/dispatch", { jobId: B.jobId, technicianId: B.techId });

  const after = JSON.stringify(await snapshotB(B));
  const leaks = results.filter((r) => r.leaked.length);
  for (const c of controls) console.log(`ctrl ${c.status} GET ${c.path} ${c.own ? "(A's own data returned)" : "(NO A DATA)"}`);
  for (const r of results) console.log(`${r.leaked.length ? "LEAK" : "ok  "} ${r.status} ${r.method} ${r.path}${r.leaked.length ? ` → ${r.leaked.join(", ")}` : ""}`);
  console.log(`\n${results.length} requests · ${leaks.length} leaked · B rows ${before === after ? "unchanged" : "CHANGED"}`);
  if (before !== after) console.log("before", before, "\nafter ", after);
  const controlsOk = controls.every((c) => c.status === 200 && c.own);
  console.log(`controls ${controlsOk ? "pass" : "FAIL"}`);
  process.exitCode = leaks.length || before !== after || !controlsOk ? 1 : 0;
}

async function snapshotB(B) {
  const [biz, job, lead, customer, tech, est] = await Promise.all([
    prisma.business.findUnique({ where: { id: B.id }, select: { name: true, greeting: true, updatedAt: true } }),
    B.jobId ? prisma.job.findUnique({ where: { id: B.jobId }, select: { status: true, notes: true, updatedAt: true, finalAmountCents: true } }) : null,
    prisma.lead.findUnique({ where: { id: B.leadId }, select: { status: true, notes: true, updatedAt: true } }),
    B.customerId ? prisma.customer.findUnique({ where: { id: B.customerId }, select: { name: true, updatedAt: true } }) : null,
    prisma.technician.findUnique({ where: { id: B.techId }, select: { name: true } }),
    B.estimateId ? prisma.estimate.findUnique({ where: { id: B.estimateId }, select: { status: true, amountCents: true } }) : null,
  ]);
  return { biz, job, lead, customer, tech, est };
}

async function cleanup() {
  if (!existsSync(STATE)) return;
  const s = JSON.parse(readFileSync(STATE, "utf8"));
  await prisma.business.deleteMany({ where: { id: { in: [s.a.id, s.b.id] } } });
}

try {
  if (mode === "seed") await seed();
  else if (mode === "attack") await attack();
  else if (mode === "cleanup") await cleanup();
} finally {
  await prisma.$disconnect();
}
