#!/usr/bin/env node
/**
 * Scale simulator — a population of shops taking a realistic mix of calls at
 * once, through the real post-call pipeline, with nothing billed.
 *
 * `call-sim.mjs` grades 31 hand-written calls one at a time. This generates
 * thousands from a seeded random population: shops across trades, time zones
 * and crew sizes; callers who book, smell gas, live outside the area, hang up,
 * call back, speak Spanish, want a person, shop on price, or are robocalls;
 * extractors that leave fields empty or write urgency as "ASAP!!"; and Vapi
 * re-delivering reports. Every call is graded on what its kind of caller
 * needs, and the whole run is checked for what must never happen at any
 * scale: a lost call, a booked safety call, one shop seeing another's
 * caller, or a technician in two places.
 *
 * Seeds test-environment shops and deletes them afterwards.
 *
 *   APP_URL=http://127.0.0.1:3000 VAPI_WEBHOOK_SECRET=… node scripts/scale-sim.mjs \
 *     [--shops 12] [--calls 600] [--concurrency 20] [--dupes 0.15] [--seed 1] [--json out.json] [--report out.md]
 */
import { writeFileSync } from "node:fs";
import { createScriptPrisma, loadEnvFile } from "./lib/db.mjs";

loadEnvFile();

const APP_URL = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const VAPI_SECRET = process.env.VAPI_WEBHOOK_SECRET?.trim();
const args = process.argv.slice(2);
const arg = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const SHOPS = Number(arg("--shops", 12));
const CALLS = Number(arg("--calls", 600));
const CONCURRENCY = Number(arg("--concurrency", 20));
const DUPES = Number(arg("--dupes", 0.15));
const SEED = Number(arg("--seed", 1));
const jsonOut = arg("--json", null);
const reportOut = arg("--report", null);

/** mulberry32: the same seed replays the same population. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

/** Most bookings any one technician has at the same instant. */
export function techOverlaps(jobs) {
  const byTech = new Map();
  for (const j of jobs) {
    if (!j.technicianId || !j.scheduledAt) continue;
    const list = byTech.get(j.technicianId) ?? [];
    list.push([j.scheduledAt.getTime(), j.scheduledAt.getTime() + (j.durationMin ?? 60) * 60_000, j.id]);
    byTech.set(j.technicianId, list);
  }
  const clashes = [];
  for (const [tech, list] of byTech) {
    list.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < list.length; i++) {
      if (list[i][0] < list[i - 1][1]) clashes.push({ tech, a: list[i - 1][2], b: list[i][2] });
    }
  }
  return clashes;
}

const TRADES = {
  HVAC: {
    skills: [["heating", "cooling"], ["cooling"], ["maintenance", "controls"], []],
    issues: ["Furnace blowing cold air", "AC not cooling", "No heat", "Thermostat blank", "Heat pump making grinding noise", "Annual tune-up"],
    hazard: ["I smell gas near the furnace", "The carbon monoxide alarm keeps going off", "There's a burning smell from the vents"],
  },
  Plumbing: {
    skills: [[]],
    issues: ["Water heater leaking", "Kitchen sink clogged", "Toilet running nonstop", "Low water pressure", "Garbage disposal jammed"],
    hazard: ["I smell gas by the water heater", "Water is pouring onto the electrical panel"],
  },
  Electrical: {
    skills: [[]],
    issues: ["Half the outlets stopped working", "Breaker keeps tripping", "Install a ceiling fan", "Need an EV charger installed"],
    hazard: ["An outlet is sparking and smoking", "There's a burning smell from the breaker panel"],
  },
  "Garage doors": {
    skills: [[]],
    issues: ["Garage door won't open", "Broken garage door spring", "Opener remote stopped working"],
    hazard: ["The garage door fell on my car and someone is trapped"],
  },
  "Appliance repair": {
    skills: [[]],
    issues: ["Fridge not cooling", "Dryer not heating", "Dishwasher leaking", "Washer won't drain"],
    hazard: ["The oven smells like gas", "The dryer is smoking"],
  },
};
const ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix"];
const FIRST = ["Maria", "James", "Aisha", "Wei", "Carlos", "Priya", "Tom", "Fatima", "Noah", "Elena", "Kofi", "Hana", "Liam", "Sofia", "Raj", "Grace"];
const LAST = ["Lopez", "Smith", "Okafor", "Chen", "Garcia", "Patel", "O'Brien", "Haddad", "Kim", "Rossi", "Mensah", "Sato", "Nguyen", "Kowalski"];
const STREETS = ["Oak Ave", "Main St", "Maple Dr", "Elm St", "Cedar Ln", "Ridge Rd", "Lake St", "Park Blvd"];
const URGENCY = ["same-day", "this-week", "flexible", "ASAP!!", "today please", "whenever", "", "Emergency"];
/** What the caller said, the service type an extractor might write, and an honest summary. */
const SPAM = [
  ["This is an important message about your business line of credit. Press one to speak with a funding specialist.", "Business funding offer", "Automated call offering business funding."],
  ["Hi, I'm calling from Local Rank Pros about your Google Business listing, is the owner available?", "Marketing services for the business", "Sales call about the shop's Google listing."],
  ["Is this Dr. Patel's dental office? Oh sorry, wrong number.", "", "Wrong number, caller wanted a dentist."],
];

/** Weighted mix of who calls a home-service shop. */
const KINDS = [
  ["book", 46],
  ["book_messy", 8],
  ["transcript_only", 4],
  ["repeat", 5],
  ["spanish", 3],
  ["safety", 5],
  ["out_of_area", 5],
  ["hangup", 7],
  ["spam", 11],
  ["wants_human", 3],
  ["price_shopper", 3],
];

function pick(r, list) {
  return list[Math.floor(r() * list.length)];
}

function pickKind(r) {
  const total = KINDS.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [k, w] of KINDS) if ((x -= w) < 0) return k;
  return "book";
}

function buildShops(r, stamp) {
  const digits = String(stamp).slice(-5);
  return Array.from({ length: SHOPS }, (_, i) => {
    const trade = Object.keys(TRADES)[i % Object.keys(TRADES).length];
    const zipBase = 10_000 + Math.floor(r() * 80_000);
    return {
      i,
      trade,
      name: `${pick(r, ["Summit", "Bluebird", "Northside", "Apex", "Riverbend", "Keystone"])} ${trade} ${i}`,
      slug: `scale-sim-${stamp}-${i}`,
      line: `+1555${digits}${String(i).padStart(2, "0")}`,
      ownerPhone: `+1556${digits}${String(i).padStart(2, "0")}`,
      zips: [zipBase, zipBase + 1, zipBase + 2].map(String),
      timezone: pick(r, ZONES),
      techs: Math.floor(r() * 5),
      city: pick(r, ["Springfield", "Riverton", "Fairview", "Georgetown", "Madison"]),
    };
  });
}

/** One caller: the calls they make and what a good dispatcher does with them. */
function buildCaller(r, shop, n, stamp) {
  const kind = pickKind(r);
  const t = TRADES[shop.trade];
  const name = `${pick(r, FIRST)} ${pick(r, LAST)}`;
  const phone = `+1${200 + shop.i}${String(stamp).slice(-3)}${String(n).padStart(4, "0")}`;
  const zip = pick(r, shop.zips);
  const address = `${100 + Math.floor(r() * 9000)} ${pick(r, STREETS)}, ${shop.city} ${zip}`;
  const issue = pick(r, t.issues);
  const id = (k) => `scale_${stamp}_${shop.i}_${n}_${k}`;
  const call = (k, over) => ({
    callId: id(k),
    phone,
    durationSeconds: 60 + Math.floor(r() * 240),
    transcript: `AI: ${shop.name}, how can I help?\nUser: ${issue}.\nAI: What's the address?\nUser: ${address}.`,
    summary: `Caller reports: ${issue.toLowerCase()}.`,
    structured: { name, phone, serviceType: issue, urgency: pick(r, URGENCY.slice(0, 3)), address },
    ...over,
  });

  switch (kind) {
    case "book":
      return { kind, phone, calls: [call(0)], expect: { jobs: 1, alert: true } };
    case "book_messy": {
      const messyPhone = phone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");
      return {
        kind,
        phone,
        calls: [call(0, { structured: { name: name.toUpperCase(), phone: messyPhone, serviceType: issue, urgency: pick(r, URGENCY), address: address.replace(",", "") } })],
        expect: { jobs: 1, alert: true },
      };
    }
    case "transcript_only":
      return {
        kind,
        phone,
        calls: [call(0, { structured: {}, summary: "", transcript: `User: Hi, this is ${name.split(" ")[0]}. ${issue}. I'm at ${address}. Tomorrow works.` })],
        expect: { alert: true },
      };
    case "repeat":
      return {
        kind,
        phone,
        calls: [
          call(0, { transcript: `User: ${issue}, I'm at ${address}—\nAI: Hello?`, durationSeconds: 25 }),
          call(1, { transcript: `User: Sorry, got cut off. ${issue} at ${address}.\nAI: Got it.` }),
        ],
        sequential: true,
        expect: { jobs: 1 },
      };
    case "spanish":
      return {
        kind,
        phone,
        calls: [call(0, { transcript: `User: Hola, tengo un problema: ${issue}. Mi dirección es ${address}.\nAI: Entendido.`, structured: { name, phone, serviceType: issue, address } })],
        expect: { jobs: 1, alert: true },
      };
    case "safety": {
      const hazard = pick(r, t.hazard);
      return {
        kind,
        phone,
        calls: [call(0, { transcript: `User: ${hazard}.\nAI: Please leave the home now and call 911 or the utility.\nUser: Okay, I'm at ${address}.`, summary: `Caller reports ${issue.toLowerCase()}.` })],
        expect: { jobs: 0, skip: "safety_escalation", alert: /SAFETY/ },
      };
    }
    case "out_of_area": {
      const far = `${100 + Math.floor(r() * 900)} Broadway, Far City ${String(Number(shop.zips[0]) + 500)}`;
      return {
        kind,
        phone,
        calls: [call(0, { transcript: `User: ${issue}.\nAI: Address?\nUser: ${far}.`, structured: { name, phone, serviceType: issue, urgency: "same-day", address: far } })],
        expect: { jobs: 0, skip: "out_of_area", alert: true },
      };
    }
    case "hangup":
      return {
        kind,
        phone,
        calls: [call(0, { transcript: `User: Hi, my ${issue.toLowerCase()} and—\nAI: Hello? Are you still there?`, summary: "Caller hung up mid-call.", structured: { serviceType: issue }, durationSeconds: 12 })],
        expect: { jobs: 0, alert: true },
      };
    case "spam": {
      const [line, svc, honest] = pick(r, SPAM);
      // Extractors often leave a useless summary; the caller's words still say what it was.
      return {
        kind,
        phone,
        calls: [call(0, { transcript: `User: ${line}`, summary: pick(r, [honest, "Not a customer.", ""]), structured: svc && r() < 0.5 ? { serviceType: svc } : {}, durationSeconds: 20 })],
        expect: { jobs: 0, noAlert: true },
      };
    }
    case "wants_human":
      return {
        kind,
        phone,
        calls: [call(0, { transcript: `User: I don't want to talk to a robot, can I talk to a real person?\nAI: I'll have the owner call you. What's going on?\nUser: ${issue}, ${address}.` })],
        expect: { alert: /person|call (her|him|them) back|callback|wants? to talk/i },
      };
    case "price_shopper":
      return {
        kind,
        phone,
        calls: [call(0, { transcript: `User: How much do you charge for that?\nAI: A technician confirms pricing on site. Want me to set up a visit?\nUser: No thanks, just shopping around.`, structured: { serviceType: `${issue} price question` } })],
        expect: { jobs: 0 },
      };
  }
}

function payload(shop, c) {
  return {
    message: {
      type: "end-of-call-report",
      call: { id: c.callId, customer: { number: c.phone }, phoneNumber: { number: shop.line } },
      summary: c.summary,
      transcript: c.transcript,
      durationSeconds: c.durationSeconds,
      analysis: { structuredData: c.structured },
    },
  };
}

async function post(body) {
  const started = performance.now();
  try {
    const res = await fetch(`${APP_URL}/api/webhooks/vapi`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(VAPI_SECRET ? { "x-vapi-secret": VAPI_SECRET } : {}) },
      body: JSON.stringify(body),
    });
    await res.arrayBuffer();
    return { ms: performance.now() - started, status: res.status };
  } catch (err) {
    return { ms: performance.now() - started, status: 0, error: String(err?.message ?? err) };
  }
}

async function seedShops(prisma, shops) {
  const ids = new Map();
  for (const s of shops) {
    const b = await prisma.business.create({
      data: {
        name: s.name,
        slug: s.slug,
        environment: "test",
        trade: s.trade,
        ownerEmail: `${s.slug}@orvius.test`,
        ownerPhone: s.ownerPhone,
        twilioPhone: s.line,
        vapiPhoneNumber: s.line,
        lineVerifiedAt: new Date(),
        billingStatus: "active",
        avgTicketCents: 35_000,
        address: `1 Main St, ${s.city} ${s.zips[0]}`,
        servicesJson: JSON.stringify(TRADES[s.trade].issues.map((name) => ({ name }))),
        serviceZipsJson: JSON.stringify(s.zips),
        hoursJson: "{}",
        timezone: s.timezone,
      },
    });
    ids.set(s.i, b.id);
    const skills = TRADES[s.trade].skills;
    for (let k = 0; k < s.techs; k++) {
      await prisma.technician.create({
        data: { businessId: b.id, name: `Tech ${s.i}-${k}`, phone: `+1557${String(s.i).padStart(3, "0")}${String(k).padStart(4, "0")}`, skillsJson: JSON.stringify(skills[k % skills.length]) },
      });
    }
  }
  return ids;
}

async function waitForFinish(prisma, callIds, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const events = await prisma.webhookEvent.findMany({
      where: { source: "vapi", eventType: "end-of-call-report", externalId: { in: callIds } },
      select: { externalId: true, status: true, payloadJson: true, error: true },
    });
    const done = events.filter((e) => e.status !== "captured" && e.status !== "processing");
    if (done.length >= callIds.length || Date.now() > deadline) return new Map(events.map((e) => [e.externalId, e]));
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function main() {
  const prisma = createScriptPrisma();
  const r = rng(SEED);
  const stamp = Date.now();
  const shops = buildShops(r, stamp);
  const callers = Array.from({ length: CALLS }, (_, n) => {
    const shop = shops[Math.floor(r() * shops.length)];
    return { ...buildCaller(r, shop, n, stamp), shop };
  });

  console.log(`\n🌆 Scale simulation · ${APP_URL} · seed ${SEED}`);
  console.log(`   ${SHOPS} shops · ${callers.length} callers · ${callers.reduce((s, c) => s + c.calls.length, 0)} calls · ${CONCURRENCY} at a time · ${Math.round(DUPES * 100)}% re-delivered\n`);
  const businessIds = await seedShops(prisma, shops);

  // Independent callers go out shuffled and in parallel; a caller's own calls stay in order.
  const queue = [];
  for (const c of callers) queue.push(c);
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  const responses = [];
  const dupes = [];
  let next = 0;
  const wallStart = performance.now();
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < queue.length) {
        const caller = queue[next++];
        for (const [k, c] of caller.calls.entries()) {
          const body = payload(caller.shop, c);
          responses.push({ ...(await post(body)), callId: c.callId });
          if (r() < DUPES) dupes.push(body);
          if (k < caller.calls.length - 1) await new Promise((res) => setTimeout(res, 400));
        }
      }
    }),
  );
  for (const body of dupes) responses.push({ ...(await post(body)), callId: body.message.call.id, dupe: true });
  const wallMs = performance.now() - wallStart;

  const allCallIds = callers.flatMap((c) => c.calls.map((x) => x.callId));
  const events = await waitForFinish(prisma, allCallIds, 180_000);
  await new Promise((res) => setTimeout(res, 3000));

  const bizIds = [...businessIds.values()];
  const [calls, leads, jobs, notes, customers] = await Promise.all([
    prisma.call.findMany({ where: { vapiCallId: { in: allCallIds } }, select: { id: true, vapiCallId: true, businessId: true } }),
    prisma.lead.findMany({ where: { businessId: { in: bizIds } }, select: { id: true, businessId: true, phone: true, callId: true, urgency: true } }),
    prisma.job.findMany({ where: { businessId: { in: bizIds } }, select: { id: true, businessId: true, leadId: true, customerId: true, technicianId: true, scheduledAt: true, durationMin: true, status: true, lead: { select: { phone: true, businessId: true } } } }),
    prisma.ownerNotification.findMany({ where: { businessId: { in: bizIds } }, select: { businessId: true, leadId: true, message: true } }),
    prisma.customer.findMany({ where: { businessId: { in: bizIds } }, select: { id: true, businessId: true, phone: true } }),
  ]);

  const callByVapi = new Map(calls.map((c) => [c.vapiCallId, c]));
  const leadByCall = new Map(leads.filter((l) => l.callId).map((l) => [l.callId, l]));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const notesByLead = new Map();
  for (const n of notes) if (n.leadId) notesByLead.set(n.leadId, [...(notesByLead.get(n.leadId) ?? []), n]);
  const digitsOf = (p) => String(p ?? "").replace(/\D/g, "").slice(-10);

  const failures = [];
  const byKind = new Map();
  const fail = (kind, rule, detail) => failures.push({ kind, rule, detail });

  for (const c of callers) {
    const bizId = businessIds.get(c.shop.i);
    const stat = byKind.get(c.kind) ?? { callers: 0, ok: 0 };
    stat.callers += 1;
    byKind.set(c.kind, stat);
    const before = failures.length;

    for (const x of c.calls) {
      const call = callByVapi.get(x.callId);
      if (!call) {
        fail(c.kind, "call saved", x.callId);
        continue;
      }
      if (call.businessId !== bizId) fail(c.kind, "call on the shop that was dialled", x.callId);
      const ev = events.get(x.callId);
      if (!ev || ev.status !== "processed") fail(c.kind, "call finished", `${x.callId}: ${ev?.status ?? "no event"} ${ev?.error ?? ""}`.trim());
    }
    const last = c.calls[c.calls.length - 1];
    const lastCall = callByVapi.get(last.callId);
    const lead = lastCall ? leadByCall.get(lastCall.id) : null;
    const outcome = JSON.parse(events.get(last.callId)?.payloadJson ?? "{}");
    const mine = jobs.filter((j) => j.businessId === bizId && digitsOf(j.lead?.phone) === digitsOf(c.phone));
    const texts = lead ? notesByLead.get(lead.id) ?? [] : [];
    const e = c.expect;

    if (e.jobs != null && mine.length !== e.jobs) fail(c.kind, `${e.jobs} job(s)`, `${last.callId}: got ${mine.length} (${outcome.skipReason ?? "booked"})`);
    if (e.skip && outcome.skipReason !== e.skip) fail(c.kind, `skip ${e.skip}`, `${last.callId}: got ${outcome.skipReason ?? "none"}`);
    if (e.alert === true && !texts.length) fail(c.kind, "owner told", last.callId);
    if (e.alert instanceof RegExp && !texts.some((t) => e.alert.test(t.message))) fail(c.kind, `owner text ${e.alert}`, `${last.callId}: ${texts[0]?.message?.slice(0, 120) ?? "no text"}`);
    if (e.noAlert && texts.length) fail(c.kind, "owner not bothered", `${last.callId}: ${texts[0].message.slice(0, 120)}`);
    if (failures.length === before) stat.ok += 1;
  }

  // What must hold across the whole run, whoever called.
  const global = [];
  const check = (name, bad) => {
    global.push({ name, ok: bad.length === 0, count: bad.length, sample: bad.slice(0, 3) });
  };
  check("every request answered 2xx", responses.filter((x) => x.status < 200 || x.status >= 300).map((x) => `${x.callId} ${x.status} ${x.error ?? ""}`));
  check("one call record per call", allCallIds.filter((id) => !callByVapi.has(id)));
  const leadsPerCall = new Map();
  for (const l of leads) if (l.callId) leadsPerCall.set(l.callId, (leadsPerCall.get(l.callId) ?? 0) + 1);
  check("one lead per call", calls.filter((c) => leadsPerCall.get(c.id) !== 1).map((c) => c.vapiCallId));
  check("never two jobs for one lead", Object.entries(jobs.reduce((m, j) => ((m[j.leadId] = (m[j.leadId] ?? 0) + 1), m), {})).filter(([, n]) => n > 1).map(([id]) => id));
  check("job, lead and customer on the same shop", jobs.filter((j) => j.lead?.businessId !== j.businessId || (j.customerId && customerById.get(j.customerId)?.businessId !== j.businessId)).map((j) => j.id));
  const phonesByShop = new Map();
  for (const c of callers) {
    const id = businessIds.get(c.shop.i);
    phonesByShop.set(id, new Set([...(phonesByShop.get(id) ?? []), digitsOf(c.phone)]));
  }
  check("owner texts only mention their own callers", notes.filter((n) => {
    const own = phonesByShop.get(n.businessId) ?? new Set();
    return callers.some((c) => !own.has(digitsOf(c.phone)) && n.message.replace(/\D/g, "").includes(digitsOf(c.phone)));
  }).map((n) => n.message.slice(0, 80)));
  check("no technician in two places", techOverlaps(jobs.filter((j) => j.status !== "cancelled")).map((x) => `${x.tech}: ${x.a} / ${x.b}`));
  check("safety calls never booked", callers.filter((c) => c.kind === "safety").filter((c) => jobs.some((j) => j.businessId === businessIds.get(c.shop.i) && digitsOf(j.lead?.phone) === digitsOf(c.phone))).map((c) => c.phone));

  const lat = responses.map((x) => x.ms).sort((a, b) => a - b);
  const summary = {
    at: new Date().toISOString(),
    seed: SEED,
    shops: SHOPS,
    callers: callers.length,
    calls: allCallIds.length,
    redeliveries: dupes.length,
    wallMs: Math.round(wallMs),
    latencyMs: { p50: Math.round(percentile(lat, 50)), p95: Math.round(percentile(lat, 95)), p99: Math.round(percentile(lat, 99)), max: Math.round(lat.at(-1) ?? 0) },
    jobsBooked: jobs.length,
    kinds: Object.fromEntries(byKind),
    global,
    failures,
  };

  console.log(`   ${responses.length} requests in ${(wallMs / 1000).toFixed(1)}s · p50 ${summary.latencyMs.p50}ms · p95 ${summary.latencyMs.p95}ms · p99 ${summary.latencyMs.p99}ms · ${jobs.length} jobs booked\n`);
  console.log("   Never, at any scale:");
  for (const g of global) console.log(`   ${g.ok ? "✅" : "❌"} ${g.name}${g.ok ? "" : ` (${g.count}) e.g. ${g.sample.join(" · ")}`}`);
  console.log("\n   Each caller handled the way a good dispatcher would:");
  for (const [k, s] of byKind) console.log(`   ${s.ok === s.callers ? "✅" : "❌"} ${k.padEnd(16)} ${s.ok}/${s.callers}`);
  const grouped = new Map();
  for (const f of failures) {
    const key = `${f.kind} · ${f.rule}`;
    grouped.set(key, [...(grouped.get(key) ?? []), f.detail]);
  }
  if (grouped.size) {
    console.log("\n   Failures:");
    for (const [k, list] of grouped) console.log(`   ${k} (${list.length}) e.g. ${list.slice(0, 2).join(" | ")}`);
  }
  const passed = [...byKind.values()].reduce((s, x) => s + x.ok, 0);
  console.log(`\n   ${passed}/${callers.length} callers handled right · ${global.filter((g) => g.ok).length}/${global.length} hard rules held\n`);

  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(summary, null, 2));
  if (reportOut) {
    const md = [
      `# Scale simulation · seed ${SEED}`,
      "",
      `${SHOPS} shops · ${callers.length} callers · ${allCallIds.length} calls · ${dupes.length} re-deliveries · ${CONCURRENCY} at a time`,
      "",
      `Latency p50 ${summary.latencyMs.p50}ms · p95 ${summary.latencyMs.p95}ms · p99 ${summary.latencyMs.p99}ms · ${jobs.length} jobs booked`,
      "",
      "| Hard rule | Result |",
      "| --- | --- |",
      ...global.map((g) => `| ${g.name} | ${g.ok ? "held" : `broken ×${g.count}`} |`),
      "",
      "| Caller | Handled right |",
      "| --- | --- |",
      ...[...byKind].map(([k, s]) => `| ${k} | ${s.ok}/${s.callers} |`),
      "",
      ...(grouped.size ? ["## Failures", "", ...[...grouped].map(([k, list]) => `- ${k} (${list.length}): ${list.slice(0, 3).join(" · ")}`)] : []),
    ].join("\n");
    writeFileSync(reportOut, `${md}\n`);
  }

  await prisma.business.deleteMany({ where: { id: { in: bizIds } } }).catch((err) => console.error("cleanup failed", err?.message));
  await prisma.$disconnect?.();
  if (failures.length || global.some((g) => !g.ok)) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
