#!/usr/bin/env node
/**
 * Call simulator — realistic callers through the real post-call pipeline.
 *
 * Each scenario is what Vapi would send at the end of a call: the transcript,
 * the summary, and the structured fields its extractor filled in (sometimes
 * wrong or empty, as in production). The simulator posts it to the running
 * app's webhook, then reads back what Orvius actually did — lead, job,
 * urgency, the owner's text — and grades it against what a good dispatcher
 * would have done.
 *
 * Seeds its own test-environment shop and deletes it afterwards.
 *
 *   APP_URL=http://127.0.0.1:3000 VAPI_WEBHOOK_SECRET=… node scripts/call-sim.mjs [--json out.json] [--only id,id]
 */
import { writeFileSync } from "node:fs";
import { createScriptPrisma, loadEnvFile } from "./lib/db.mjs";

loadEnvFile();
const prisma = createScriptPrisma();

const APP_URL = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const VAPI_SECRET = process.env.VAPI_WEBHOOK_SECRET?.trim();
const args = process.argv.slice(2);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;

const stamp = Date.now();
const digits = String(stamp).slice(-6);
const shop = {
  name: `Sim Heating ${digits}`,
  slug: `call-sim-${stamp}`,
  line: `+1555${digits}0`,
  ownerPhone: `+1555${digits}9`,
};
let phoneSeq = 0;
const nextPhone = () => `+1312${digits.slice(-4)}${String(phoneSeq++).padStart(3, "0")}`;

const T = (...lines) => lines.join("\n");

/**
 * expect:
 *   jobs        exact number of jobs for this caller after all calls
 *   skip        skipReason on the last call
 *   urgency     lead urgency on the last call (or list of acceptable values)
 *   alert       regex the owner's text for the last call must match
 *   alertNot    regex the owner's text for the last call must not match
 *   noAlert     true when the owner should not be texted for the last call
 */
const scenarios = [
  {
    id: "clean-booking",
    name: "No heat, full details, this week",
    calls: [
      {
        transcript: T("AI: Summit Heating, what's going on?", "User: Furnace is blowing cold air.", "AI: Address?", "User: 2200 Ridge Ave, Evanston 60201.", "AI: This week okay?", "User: Yes."),
        summary: "Caller's furnace is blowing cold air; wants a visit this week.",
        structured: { name: "Morgan Ellis", serviceType: "Furnace blowing cold air", urgency: "this-week", address: "2200 Ridge Ave, Evanston IL 60201" },
      },
    ],
    expect: { jobs: 1, urgency: ["this-week", "same-day"] },
  },
  {
    id: "gas-in-transcript-only",
    name: "Gas smell mentioned only in the conversation",
    calls: [
      {
        transcript: T("AI: What's going on?", "User: My furnace won't turn on and honestly I smell gas in the basement.", "AI: Please leave the home and call the gas company. What's the address?", "User: 915 Hinman Ave, Evanston 60202."),
        summary: "Caller's furnace will not turn on.",
        structured: { name: "Priya Shah", serviceType: "Furnace won't turn on", urgency: "same-day", address: "915 Hinman Ave, Evanston IL 60202" },
      },
    ],
    expect: { jobs: 0, skip: "safety_escalation", urgency: "emergency", alert: /SAFETY/ },
  },
  {
    id: "co-alarm",
    name: "Carbon monoxide alarm going off",
    calls: [
      {
        transcript: T("User: The carbon monoxide alarm keeps going off near the furnace.", "AI: Please get everyone outside and call 911."),
        summary: "CO alarm sounding near the furnace.",
        structured: { name: "Owen Park", serviceType: "Carbon monoxide alarm going off", urgency: "emergency", address: "1127 Davis St, Evanston IL 60201" },
      },
    ],
    expect: { jobs: 0, skip: "safety_escalation", alert: /SAFETY/ },
  },
  {
    id: "burning-smell",
    name: "Burning smell from the unit",
    calls: [
      {
        transcript: T("User: There's a burning smell coming from the furnace vents."),
        summary: "Burning smell from furnace vents.",
        structured: { name: "Rosa Diaz", serviceType: "Burning smell from furnace", address: "702 Main St, Evanston IL 60202" },
      },
    ],
    expect: { jobs: 0, skip: "safety_escalation", alert: /SAFETY/ },
  },
  {
    id: "out-of-area",
    name: "Caller outside the service ZIPs",
    calls: [
      {
        transcript: T("User: AC is out.", "AI: Address?", "User: 1400 N Wells St, Chicago 60610."),
        summary: "AC not cooling in Chicago.",
        structured: { name: "Lena Novak", serviceType: "AC not cooling", urgency: "same-day", address: "1400 N Wells St, Chicago IL 60610" },
      },
    ],
    expect: { jobs: 0, skip: "out_of_area", alert: /outside|service area|out of area/i },
  },
  {
    id: "hangup-no-address",
    name: "Call drops before the address",
    calls: [
      {
        transcript: T("User: Hi, my AC is leaking water all over the—", "AI: Hello? Are you still there?"),
        summary: "Caller hung up mid-call while describing an AC leak.",
        structured: { serviceType: "AC leaking water" },
        durationSeconds: 14,
      },
    ],
    expect: { jobs: 0, skip: "missing_address", alert: /address|call (them )?back|hung up/i },
  },
  {
    id: "robocall",
    name: "Robocall about business funding",
    calls: [
      {
        transcript: T("User: This is an important message about your business line of credit. Press one to speak with a funding specialist."),
        summary: "Automated sales call about business funding.",
        structured: { serviceType: "Business funding offer" },
        durationSeconds: 22,
      },
    ],
    expect: { jobs: 0, noAlert: true },
  },
  {
    id: "seo-sales",
    name: "Sales rep selling Google listings",
    calls: [
      {
        transcript: T("User: Hi, I'm calling from Local Rank Pros about your Google Business listing, is the owner available?", "AI: I can take a message."),
        summary: "Sales call from a marketing agency asking for the owner.",
        structured: { name: "Kyle", serviceType: "Marketing services for the business" },
      },
    ],
    expect: { jobs: 0, noAlert: true },
  },
  {
    id: "wrong-number",
    name: "Wrong number",
    calls: [
      {
        transcript: T("User: Is this Dr. Patel's dental office?", "AI: No, this is Summit Heating.", "User: Oh sorry, wrong number."),
        summary: "Wrong number, caller was looking for a dentist.",
        structured: {},
        durationSeconds: 11,
      },
    ],
    expect: { jobs: 0, noAlert: true },
  },
  {
    id: "wants-human",
    name: "Caller insists on talking to a person",
    calls: [
      {
        transcript: T("User: I don't want to talk to a robot, can I talk to a real person?", "AI: I'll have the owner call you. What's going on?", "User: Water heater quote, 311 Lake St, Evanston."),
        summary: "Caller asked to talk to a real person about a replacement quote.",
        structured: { name: "Helen Brooks", serviceType: "Replacement quote", address: "311 Lake St, Evanston IL 60201" },
      },
    ],
    expect: { alert: /person|call (her|him|them) back|callback|wants? to talk/i },
  },
  {
    id: "repeat-caller",
    name: "Same caller, dropped call, calls back twice",
    samePhone: true,
    calls: [
      {
        transcript: T("User: No heat at my house, it's 2400 Orrington Ave—", "AI: Hello?"),
        summary: "Caller reporting no heat; call dropped.",
        structured: { name: "Grace Kim", serviceType: "No heat", urgency: "same-day", address: "2400 Orrington Ave, Evanston IL 60201" },
        durationSeconds: 30,
      },
      {
        transcript: T("User: Sorry, got cut off. No heat at 2400 Orrington.", "AI: Got it."),
        summary: "Caller calling back about no heat.",
        structured: { name: "Grace Kim", serviceType: "No heat", urgency: "same-day", address: "2400 Orrington Ave, Evanston IL 60201" },
      },
      {
        transcript: T("User: Just making sure you got my request about the heat."),
        summary: "Caller confirming the no-heat request went through.",
        structured: { name: "Grace Kim", serviceType: "No heat", urgency: "same-day", address: "2400 Orrington Ave, Evanston IL 60201" },
      },
    ],
    expect: { jobs: 1 },
  },
  {
    id: "existing-appointment-check",
    name: "Booked customer calls to ask when the tech arrives",
    samePhone: true,
    calls: [
      {
        transcript: T("User: AC isn't cooling. 620 Grove St, Evanston."),
        summary: "AC not cooling.",
        structured: { name: "Marcus Hill", serviceType: "AC not cooling", urgency: "this-week", address: "620 Grove St, Evanston IL 60201" },
      },
      {
        transcript: T("User: Hi, I have an appointment with you guys, I just wanted to know what time the tech is coming?", "AI: Let me have the office confirm the time with you."),
        summary: "Existing customer asking what time the technician will arrive for their AC appointment.",
        structured: { name: "Marcus Hill", serviceType: "AC not cooling - checking appointment time", address: "620 Grove St, Evanston IL 60201" },
      },
    ],
    expect: { jobs: 1, alert: /appointment|already booked|existing/i },
  },
  {
    id: "cancel-request",
    name: "Booked customer calls to cancel",
    samePhone: true,
    calls: [
      {
        transcript: T("User: I need a tune-up. 1500 Chicago Ave, Evanston."),
        summary: "Tune-up request.",
        structured: { name: "Dana Whitfield", serviceType: "Tune-up", urgency: "flexible", address: "1500 Chicago Ave, Evanston IL 60201" },
      },
      {
        transcript: T("User: I need to cancel my tune-up appointment, something came up."),
        summary: "Customer wants to cancel their tune-up appointment.",
        structured: { name: "Dana Whitfield", serviceType: "Cancel tune-up appointment", address: "1500 Chicago Ave, Evanston IL 60201" },
      },
    ],
    expect: { jobs: 1, alert: /cancel/i },
  },
  {
    id: "price-shopper",
    name: "Caller only asks the price",
    calls: [
      {
        transcript: T("User: How much do you charge for a furnace tune-up?", "AI: A technician confirms pricing on site. Want me to set up a visit?", "User: No thanks, just shopping around."),
        summary: "Caller asked the price of a tune-up and declined to book.",
        structured: { serviceType: "Tune-up price question" },
      },
    ],
    expect: { jobs: 0 },
  },
  {
    id: "spanish-no-heat-baby",
    name: "Spanish-speaking caller, no heat with a baby",
    calls: [
      {
        transcript: T("User: Hola, no tengo calefacción y tengo un bebé, hace mucho frío.", "AI: Entiendo. ¿Cuál es la dirección?", "User: 1840 Oak Ave, Evanston."),
        summary: "Llamante sin calefacción con un bebé en casa.",
        structured: { name: "Lucía Ramírez", serviceType: "Sin calefacción, bebé en casa", address: "1840 Oak Ave, Evanston IL 60201" },
      },
    ],
    expect: { jobs: 1, urgency: "emergency" },
  },
  {
    id: "elderly-freezing",
    name: "Elderly caller, no heat, house is freezing",
    calls: [
      {
        transcript: T("User: I'm 84 and the heat's been off since last night, the house is freezing."),
        summary: "Elderly caller with no heat; home is freezing.",
        structured: { name: "Walter Grant", serviceType: "No heat, house freezing, elderly caller", address: "418 Elm St, Evanston IL 60201" },
      },
    ],
    expect: { jobs: 1, urgency: "emergency" },
  },
  {
    id: "urgency-asap",
    name: "Extractor writes urgency as 'ASAP!!'",
    calls: [
      {
        transcript: T("User: Thermostat is blank, need someone ASAP."),
        summary: "Blank thermostat, wants someone as soon as possible.",
        structured: { name: "Sam Rivera", serviceType: "Thermostat blank", urgency: "ASAP!!", address: "915 Forest Ave, Evanston IL 60202" },
      },
    ],
    expect: { jobs: 1, urgency: ["same-day", "emergency"] },
  },
  {
    id: "indoor-water-leak",
    name: "Water pouring from the indoor unit",
    calls: [
      {
        transcript: T("User: Water is pouring from the indoor unit onto the floor."),
        summary: "Water pouring from indoor AC unit.",
        structured: { name: "Nora Walsh", serviceType: "Water pouring from the indoor unit", address: "77 Main St, Evanston IL 60202" },
      },
    ],
    expect: { jobs: 1, urgency: "emergency" },
  },
  {
    id: "no-structured-data",
    name: "Extractor returned nothing; details only in the transcript",
    calls: [
      {
        transcript: T("User: Hi, this is Ben, my AC stopped cooling. I'm at 2210 Ridge Ave in Evanston, 60201. Tomorrow works."),
        summary: "Caller Ben's AC stopped cooling at 2210 Ridge Ave, Evanston 60201; tomorrow works.",
        structured: {},
      },
    ],
    expect: { alert: /AC|cool/i },
  },
  {
    id: "commercial-property-manager",
    name: "Property manager, rooftop unit at a store",
    calls: [
      {
        transcript: T("User: I manage the Walgreens on Main, rooftop unit is down, store is 85 degrees."),
        summary: "Property manager reports rooftop AC unit down at a retail store.",
        structured: { name: "Tanya Brooks", serviceType: "Rooftop AC unit down at retail store", urgency: "same-day", address: "500 Main St, Evanston IL 60202" },
      },
    ],
    expect: { jobs: 1, urgency: ["same-day", "emergency"] },
  },
  // Pain points from public reviews of answering services and AI receptionists.
  {
    id: "heat-wave-dog",
    name: "Review: 'no AC, 96 degrees, dog is panting' booked as routine",
    calls: [
      {
        transcript: T("User: AC died this morning, it's 96 in here and the dog is panting.", "AI: I'm sorry. What's the address?", "User: 1810 Asbury Ave, Evanston 60201."),
        summary: "AC stopped working; house is 96 degrees.",
        structured: { name: "Dana Kim", serviceType: "AC not working", address: "1810 Asbury Ave, Evanston IL 60201" },
      },
    ],
    expect: { jobs: 1, urgency: ["same-day", "emergency"] },
  },
  {
    id: "assistant-quoted-price",
    name: "Review: receptionist promises a price and arrival time the shop never set",
    calls: [
      {
        transcript: T("User: Furnace is making a grinding noise.", "AI: The diagnostic is $89 and a tech can be there within the hour.", "User: Great, 1603 Chicago Ave, Evanston 60201."),
        summary: "Grinding noise from furnace.",
        structured: { name: "Sam Ortiz", serviceType: "Furnace grinding noise", urgency: "this-week", address: "1603 Chicago Ave, Evanston IL 60201" },
      },
    ],
    expect: { jobs: 1, alert: /Check: receptionist mentioned a price and an arrival time/ },
  },
  {
    id: "assistant-declined-price",
    name: "Receptionist correctly declines to quote",
    calls: [
      {
        transcript: T("User: How much is a tune-up?", "AI: I can't quote a price over the phone, but the owner will confirm it.", "User: Okay, book me. 1201 Lake St, Evanston 60201."),
        summary: "Caller wants a furnace tune-up.",
        structured: { name: "Ivy Chen", serviceType: "Furnace tune-up", urgency: "flexible", address: "1201 Lake St, Evanston IL 60201" },
      },
    ],
    expect: { jobs: 1, alertNot: /Check:/ },
  },
  {
    id: "shop-local-time",
    name: "Review: appointments texted in the wrong time zone",
    calls: [
      {
        transcript: T("User: Thermostat is blank.", "AI: Address?", "User: 830 Noyes St, Evanston 60201."),
        summary: "Thermostat display is blank.",
        structured: { name: "Joel Park", serviceType: "Thermostat blank", urgency: "this-week", address: "830 Noyes St, Evanston IL 60201" },
      },
    ],
    expect: { jobs: 1, alert: /\bC[SD]T\b/ },
  },
  {
    id: "silent-hangup",
    name: "Review: caller hangs up on the AI without a word",
    calls: [{ transcript: T("AI: Sim Heating, what's going on?"), summary: "", durationSeconds: 6, structured: {} }],
    expect: { jobs: 0, alert: /hung up/i },
  },
  {
    id: "angry-callback",
    name: "Review: angry customer about a past visit forced into a booking",
    calls: [
      {
        transcript: T("User: You guys came out Tuesday and the furnace is still not working. I want my money back.", "AI: I'm sorry. I'll get this to the owner."),
        summary: "Customer says the furnace is still broken after Tuesday's visit and wants a refund.",
        structured: { name: "Grace Lee", serviceType: "Furnace still not working after repair", urgency: "same-day", address: "1500 Oak Ave, Evanston IL 60201" },
      },
    ],
    expect: { jobs: 0, skip: "complaint", alert: /past visit or bill/ },
  },
  {
    id: "callback-number-differs",
    name: "Review: phone number captured wrong",
    calls: [
      {
        transcript: T("User: Furnace short-cycling. Call me at 312-555-0199.", "AI: Got it. Address?", "User: 2020 Maple Ave, Evanston 60201."),
        summary: "Furnace short-cycling.",
        structured: { name: "Omar Haddad", phone: "+13125550199", serviceType: "Furnace short cycling", urgency: "this-week", address: "2020 Maple Ave, Evanston IL 60201" },
      },
    ],
    expect: { alert: /Called from \+1312\d+ · confirm which number/ },
  },
  {
    id: "routine-tune-up",
    name: "Review: annual tune-up must not be triaged like an outage",
    calls: [
      {
        transcript: T("User: Just want to schedule the annual AC tune-up before summer, no rush."),
        summary: "Caller wants an annual AC tune-up, no rush.",
        structured: { name: "Beth Moore", serviceType: "Annual AC tune-up", urgency: "flexible", address: "901 Elm Ave, Evanston IL 60202" },
      },
    ],
    expect: { jobs: 1, urgency: ["flexible", "this-week"] },
  },
];

async function seed() {
  const business = await prisma.business.create({
    data: {
      name: shop.name,
      slug: shop.slug,
      environment: "test",
      trade: "HVAC",
      ownerEmail: `sim-${stamp}@orvius.test`,
      ownerPhone: shop.ownerPhone,
      twilioPhone: shop.line,
      vapiPhoneNumber: shop.line,
      lineVerifiedAt: new Date(),
      billingStatus: "active",
      avgTicketCents: 42_000,
      address: "100 Main St, Evanston IL 60201",
      servicesJson: JSON.stringify([{ name: "Furnace repair" }, { name: "AC repair" }, { name: "Tune-ups" }]),
      serviceZipsJson: JSON.stringify(["60201", "60202", "60203"]),
      hoursJson: "{}",
      timezone: "America/Chicago",
    },
  });
  for (const [name, skills] of [["Riley Tech", ["heating", "cooling"]], ["Casey Tech", ["maintenance", "controls"]]]) {
    await prisma.technician.create({
      data: { businessId: business.id, name, phone: nextPhone(), skillsJson: JSON.stringify(skills) },
    });
  }
  return business;
}

async function postCall(callId, phone, call) {
  const res = await fetch(`${APP_URL}/api/webhooks/vapi`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(VAPI_SECRET ? { "x-vapi-secret": VAPI_SECRET } : {}) },
    body: JSON.stringify({
      message: {
        type: "end-of-call-report",
        call: { id: callId, customer: { number: phone }, phoneNumber: { number: shop.line } },
        summary: call.summary,
        transcript: call.transcript,
        durationSeconds: call.durationSeconds ?? 120,
        analysis: { structuredData: { phone, ...call.structured } },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`webhook ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

function matchesUrgency(actual, expected) {
  const list = Array.isArray(expected) ? expected : [expected];
  return list.includes(actual);
}

async function runScenario(business, s) {
  const phone = nextPhone();
  const failures = [];
  let last = null;
  for (let i = 0; i < s.calls.length; i++) {
    const callId = `sim_${stamp}_${s.id}_${i}`;
    last = await postCall(callId, s.samePhone === false ? nextPhone() : phone, s.calls[i]);
    if (i < s.calls.length - 1) await new Promise((r) => setTimeout(r, 150));
  }

  const lead = last.leadId
    ? await prisma.lead.findUnique({ where: { id: last.leadId } })
    : null;
  const jobs = await prisma.job.count({
    where: { businessId: business.id, OR: [{ lead: { phone } }, { customer: { phone } }] },
  });
  const alert = last.leadId
    ? await prisma.ownerNotification.findFirst({
        where: { businessId: business.id, leadId: last.leadId },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const e = s.expect;
  if (e.jobs != null && jobs !== e.jobs) failures.push(`expected ${e.jobs} job(s), got ${jobs}`);
  if (e.skip && last.skipReason !== e.skip) failures.push(`expected skip "${e.skip}", got "${last.skipReason ?? "none"}"`);
  if (e.urgency && !matchesUrgency(lead?.urgency ?? null, e.urgency))
    failures.push(`expected urgency ${JSON.stringify(e.urgency)}, got "${lead?.urgency ?? "none"}"`);
  if (e.alert && !(alert?.message && e.alert.test(alert.message)))
    failures.push(`owner text should match ${e.alert}; got "${alert?.message ?? "no text"}"`);
  if (e.alertNot && alert?.message && e.alertNot.test(alert.message))
    failures.push(`owner text should not match ${e.alertNot}; got "${alert.message}"`);
  if (e.noAlert && alert) failures.push(`owner should not be texted; got "${alert.message}"`);

  return {
    id: s.id,
    name: s.name,
    ok: failures.length === 0,
    failures,
    outcome: {
      jobs,
      skipReason: last.skipReason ?? null,
      urgency: lead?.urgency ?? null,
      categoryCode: lead?.categoryCode ?? null,
      ownerText: alert?.message ?? null,
    },
  };
}

async function main() {
  console.log(`\n📞 Orvius call simulator · ${APP_URL}\n`);
  const business = await seed();
  const results = [];
  try {
    for (const s of scenarios) {
      if (only && !only.includes(s.id)) continue;
      try {
        const r = await runScenario(business, s);
        results.push(r);
        console.log(`${r.ok ? "✅" : "❌"} ${s.name}`);
        for (const f of r.failures) console.log(`     ${f}`);
      } catch (err) {
        results.push({ id: s.id, name: s.name, ok: false, failures: [String(err?.message ?? err)] });
        console.log(`💥 ${s.name} — ${err?.message ?? err}`);
      }
    }
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
    await prisma.$disconnect?.();
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} scenarios handled the way a good dispatcher would.\n`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ at: new Date().toISOString(), passed, total: results.length, results }, null, 2));
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
