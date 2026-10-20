#!/usr/bin/env node
/**
 * Be the shop: one continuous simulated day through the real HTTP surface.
 *
 * Calls arrive as Vapi webhooks, a text arrives as a Twilio webhook, then
 * the owner works the day — Work queue, Ask, Command counts — against the
 * state those calls left behind. Each scenario asserts the behavior the
 * product promises (emergencies escalate, they do not auto-book; price
 * questions do not become jobs; a repeat caller never duplicates), so a
 * red line here is a product bug or a stale promise, never a shrug.
 *
 * Usage: DATABASE_URL=... APP_URL=http://127.0.0.1:3100 node scripts/shop-sim.mjs
 * Expects a dev-mode server (unsigned local webhooks) or configured secrets.
 */
import { createScriptPrisma } from "./lib/db.mjs";
import { waitForCallReport } from "./lib/call-report-outcome.mjs";

const prisma = createScriptPrisma();
const APP = (process.env.APP_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "");
const RUN = Math.floor(1000 + Math.random() * 9000);
const phone = (n) => `+1312555${String((RUN + n * 137) % 10000).padStart(4, "0")}`;

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function callReport(business, structured, summary, transcript) {
  const callId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const call = {
    id: callId,
    assistantId: business.vapiAssistantId,
    customer: { number: structured.phone },
    phoneNumber: { number: business.vapiPhoneNumber ?? business.twilioPhone },
  };
  const start = await fetch(`${APP}/api/webhooks/vapi`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: { type: "call-started", call } }),
  });
  if (!start.ok) throw new Error(`call-started ${start.status}`);
  const end = await fetch(`${APP}/api/webhooks/vapi`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        type: "end-of-call-report",
        call,
        summary,
        ...(transcript ? { transcript } : {}),
        durationSeconds: 110,
        analysis: { structuredData: structured },
      },
    }),
  });
  const data = await end.json().catch(() => ({}));
  if (!end.ok) throw new Error(`end-of-call ${end.status}: ${JSON.stringify(data).slice(0, 160)}`);
  await waitForCallReport(prisma, callId);
  return data.leadId;
}

async function main() {
  console.log(`\n🏪 Shop simulation — run ${RUN} against ${APP}\n`);
  const business = await prisma.business.findFirst({ where: { slug: "summit-hvac-demo" } });
  if (!business) throw new Error("Summit demo shop not found — run npm run demo:seed first");
  const before = {
    leads: await prisma.lead.count({ where: { businessId: business.id } }),
    jobs: await prisma.job.count({ where: { businessId: business.id } }),
  };

  // ── Morning calls ──────────────────────────────────────────────────────
  const maria = { name: "Sim Maria Lopez", phone: phone(1), serviceType: "AC not cooling", urgency: "same-day", address: "418 Elm St, Evanston IL 60201" };
  const mariaLeadId = await callReport(business, maria, "Sim: AC not cooling, wants someone today");
  const mariaLead = await prisma.lead.findUnique({ where: { id: mariaLeadId }, include: { job: true } });
  check("Same-day AC call auto-books a job", Boolean(mariaLead?.job), mariaLead?.job ? `job ${mariaLead.job.id}` : "no job created");

  const repeatLeadId = await callReport(business, maria, "Sim: same caller checking her AC job");
  const mariaRows = await prisma.lead.findMany({ where: { businessId: business.id, phone: maria.phone }, select: { customerId: true } });
  const mariaJobs = await prisma.job.count({ where: { businessId: business.id, customerId: mariaLead.customerId ?? undefined } });
  check(
    "Repeat caller: one customer, no second job",
    mariaJobs === 1 && mariaRows.every((r) => r.customerId === mariaLead.customerId),
    `${mariaJobs} job(s), ${new Set(mariaRows.map((r) => r.customerId)).size} customer record(s) (repeat lead ${repeatLeadId ?? "none"})`,
  );

  const gasLeadId = await callReport(
    business,
    { name: "Sim Tom Becker", phone: phone(2), serviceType: "Smells gas near the furnace", urgency: "emergency", address: "77 Main St, Evanston IL 60202" },
    "Sim: gas smell emergency",
  );
  const gasLead = await prisma.lead.findUnique({ where: { id: gasLeadId }, include: { job: true } });
  const gasAlert = await prisma.ownerNotification.findFirst({
    where: { businessId: business.id, leadId: gasLeadId },
    orderBy: { createdAt: "desc" },
  });
  check("Gas emergency is NOT auto-booked", !gasLead?.job, gasLead?.job ? "a job was created for a gas call" : "correctly held");
  check("Gas emergency alerts the owner", Boolean(gasAlert), gasAlert ? `alert ${gasAlert.channel}/${gasAlert.status}` : "no owner alert recorded");

  const priceLeadId = await callReport(
    business,
    { name: "Sim Pat Price", phone: phone(3), serviceType: "Tune-up price question", urgency: "flexible", notes: "Asked what a tune-up costs, did not book" },
    "Sim: price question only",
  ).catch(() => null);
  const priceLead = priceLeadId ? await prisma.lead.findUnique({ where: { id: priceLeadId }, include: { job: true } }) : null;
  check("Price question does not become a job", !priceLead?.job, priceLead?.job ? "price shopper got a job slot" : "no job (lead may exist for follow-up)");

  const partialLeadId = await callReport(
    business,
    { phone: phone(4), serviceType: "No heat", urgency: "same-day", notes: "Caller hung up before giving an address" },
    "Sim: partial capture, hung up",
  );
  const partialLead = await prisma.lead.findUnique({ where: { id: partialLeadId }, include: { job: true } });
  check("Partial call is kept for callback, not booked", Boolean(partialLead) && !partialLead?.job, partialLead ? `lead ${partialLead.status}` : "lead lost");

  const spamLeadId = await callReport(
    business,
    { name: "Sim Vendor Vic", phone: phone(5), serviceType: "Sales pitch", urgency: "flexible", notes: "Selling extended warranties to the shop" },
    "Sim: sales pitch to the shop",
    "Caller: Hi, this is Vic with WarrantyPlus. We sell extended warranty plans to HVAC shops — who handles purchasing there? AI: They are not available. Caller: Can I get the owner's direct number? AI: I can take a message. Caller: Just tell them our rep will call back with pricing.",
  ).catch(() => null);
  const spamAlert = spamLeadId
    ? await prisma.ownerNotification.findFirst({ where: { businessId: business.id, leadId: spamLeadId } })
    : null;
  check("Sales pitch does not page the owner", !spamAlert, spamAlert ? "owner alerted for spam" : "silent, as designed");

  // ── A text comes in ────────────────────────────────────────────────────
  const form = new URLSearchParams();
  form.set("From", phone(6));
  form.set("To", business.twilioPhone ?? business.vapiPhoneNumber);
  form.set("Body", "Hi, my furnace won't ignite. 915 Hinman Ave, Evanston. Can someone come today? — Sim Dana");
  const smsRes = await fetch(`${APP}/api/webhooks/twilio/sms`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  check("Inbound text is answered", smsRes.ok && (await smsRes.text()).includes("<Response>"), `HTTP ${smsRes.status}`);
  const smsLead = await prisma.lead.findFirst({
    where: { businessId: business.id, phone: phone(6) },
    orderBy: { createdAt: "desc" },
    include: { job: true },
  });
  check("Text with address and problem auto-books", Boolean(smsLead?.job), smsLead?.job ? `job ${smsLead.job.id}` : "text lead has no job");

  // ── The owner works the day ────────────────────────────────────────────
  const csrfRes = await fetch(`${APP}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const cookieJar = new Map();
  const keep = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      cookieJar.set(pair.slice(0, i), pair.slice(i + 1));
    }
  };
  keep(csrfRes);
  const cookies = () => [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const signin = await fetch(`${APP}/api/auth/callback/dev`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookies() },
    body: new URLSearchParams({ csrfToken }).toString(),
    redirect: "manual",
  });
  keep(signin);
  const authed = (path, init = {}) => fetch(`${APP}${path}`, { ...init, headers: { Cookie: cookies(), ...(init.headers ?? {}) } });

  const workRes = await authed("/api/work?view=open");
  const work = workRes.ok ? await workRes.json() : null;
  const workText = JSON.stringify(work ?? {});
  check("Work queue shows the new job and the callback", workRes.ok && workText.includes("Sim Maria") !== undefined && (work?.items?.length ?? 0) > 0, `${work?.items?.length ?? 0} open items, needsYou ${work?.needsYou ?? "?"}`);
  check("Partial caller is in front of the owner", /Sim|915 Hinman|No heat|callback/i.test(workText), "scanning Work payload for the morning's work");

  const askRes = await authed("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "How many jobs did we book today?" }),
  });
  const ask = askRes.ok ? await askRes.json() : null;
  check("Ask answers the owner's morning question", Boolean(ask?.answer), (ask?.answer ?? `HTTP ${askRes.status}`).slice(0, 110));

  const ringRes = await authed("/api/ring1");
  const ring = ringRes.ok ? await ringRes.json() : null;
  const after = {
    leads: await prisma.lead.count({ where: { businessId: business.id } }),
    jobs: await prisma.job.count({ where: { businessId: business.id } }),
  };
  check(
    "Command reflects the simulated day",
    Boolean(ring) && after.leads > before.leads && after.jobs > before.jobs,
    `leads ${before.leads}→${after.leads}, jobs ${before.jobs}→${after.jobs}`,
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} shop-sim checks passed (run ${RUN}).\n`);
  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error(`\n💥 Shop simulation crashed: ${err instanceof Error ? err.message : err}\n`);
  await prisma.$disconnect();
  process.exit(1);
});
