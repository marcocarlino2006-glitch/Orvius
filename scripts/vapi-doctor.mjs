#!/usr/bin/env node
/**
 * Read-only audit of the Vapi account behind the live lines.
 *
 * Every problem this reports was found by hand on the production account:
 * the marketing demo number answered by an assistant whose webhook was a dead
 * tunnel (so demo calls produced no lead), one shop number imported six times,
 * and assistants running a prompt older than the deployed code.
 *
 *   VAPI_API_KEY=… [APP_URL=https://api.orvius.im] node scripts/vapi-doctor.mjs [--json]
 *
 * Exits 1 when a number cannot deliver calls to APP_URL.
 */
const KEY = process.env.VAPI_API_KEY?.trim();
if (!KEY) {
  console.error("Set VAPI_API_KEY (the private key).");
  process.exit(2);
}
const APP_URL = (process.env.APP_URL ?? "https://api.orvius.im").replace(/\/$/, "");
const WEBHOOK = `${APP_URL}/api/webhooks/vapi`;
const asJson = process.argv.includes("--json");

async function vapi(path) {
  const res = await fetch(`https://api.vapi.ai${path}`, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`Vapi ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const [numbers, assistants] = await Promise.all([vapi("/phone-number?limit=100"), vapi("/assistant?limit=100")]);
const byId = new Map(assistants.map((a) => [a.id, a]));
const serverOf = (a) => a?.server?.url ?? a?.serverUrl ?? null;

const problems = [];
const byNumber = new Map();
for (const n of numbers) {
  if (!byNumber.has(n.number)) byNumber.set(n.number, []);
  byNumber.get(n.number).push(n);
}

const lines = [];
for (const [number, entries] of byNumber) {
  if (entries.length > 1) {
    problems.push({ severity: "warn", number, issue: `imported ${entries.length} times (${entries.map((e) => e.id).join(", ")})` });
  }
  for (const entry of entries) {
    const assistant = entry.assistantId ? byId.get(entry.assistantId) : null;
    const url = serverOf(assistant) ?? entry.server?.url ?? entry.serverUrl ?? null;
    lines.push({ number, phoneNumberId: entry.id, assistant: assistant?.name ?? entry.assistantId ?? null, webhook: url });
    if (!entry.assistantId && !url) problems.push({ severity: "error", number, issue: "no assistant and no server — calls are not answered" });
    else if (entry.assistantId && !assistant) problems.push({ severity: "error", number, issue: `assistant ${entry.assistantId} does not exist` });
    else if (url !== WEBHOOK) {
      problems.push({ severity: "error", number, issue: `webhook is ${url ?? "unset"}, not ${WEBHOOK} — calls leave no record in Orvius` });
    }
  }
}

const attached = new Set(numbers.map((n) => n.assistantId).filter(Boolean));
for (const a of assistants) {
  if (!attached.has(a.id)) {
    problems.push({ severity: "info", assistant: a.name, issue: `${a.id} is on no number (last updated ${a.updatedAt?.slice(0, 10)})` });
  } else if (!a.metadata?.orviusConfig) {
    problems.push({ severity: "warn", assistant: a.name, issue: `${a.id} predates config fingerprints — resyncs on its next call or the daily cron` });
  }
}

if (asJson) {
  console.log(JSON.stringify({ webhook: WEBHOOK, lines, problems }, null, 2));
} else {
  console.log(`\nVapi lines → expected webhook ${WEBHOOK}\n`);
  for (const l of lines) console.log(`  ${l.number}  ${l.assistant ?? "—"}  ${l.webhook ?? "no webhook"}`);
  console.log("");
  const icon = { error: "❌", warn: "⚠️ ", info: "·" };
  for (const p of problems) console.log(`${icon[p.severity]} ${p.number ?? p.assistant}: ${p.issue}`);
  if (!problems.length) console.log("✅ Every line reaches Orvius.");
  console.log("");
}
if (problems.some((p) => p.severity === "error")) process.exitCode = 1;
