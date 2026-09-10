#!/usr/bin/env node
/**
 * Proves the board reorders itself when the shop is shut.
 *
 * `kindRank` now takes the after-hours flag, so a lead nobody has qualified
 * rises and setting an average-ticket baseline sinks. The only honest way to
 * check that is to ask the live board twice with the shop's hours moved
 * around the current moment, so this reads the real endpoint both ways and
 * puts the shop's hours back afterwards.
 *
 *   node scripts/probe-night-ranking.mjs [baseUrl]
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer");
const { signInForAudit, AUDIT_EMAIL } = require("./audit-session.cjs");

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Hours that put every day either wide open or firmly shut. */
const OPEN_ALL_DAY = JSON.stringify(
  Object.fromEntries(DAYS.map((d) => [d, { open: "00:00", close: "23:59", closed: false }])),
);
const CLOSED_ALL_DAY = JSON.stringify(
  Object.fromEntries(DAYS.map((d) => [d, { open: "09:00", close: "17:00", closed: true }])),
);

const { createScriptPrisma } = await import("./lib/db.mjs");
const prisma = createScriptPrisma();

const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
let originalHours = null;
let businessId = null;
let plantedLeadId = null;

/** Reads the board the owner would see, in order. */
async function board(page) {
  const res = await page.evaluate(`(async () => {
    const r = await fetch("/api/ring1", { credentials: "include" });
    if (!r.ok) return { error: r.status };
    return await r.json();
  })()`);
  if (res.error) throw new Error(`/api/ring1 returned ${res.error}`);
  const items = res.attention ?? res.items ?? res.queue ?? [];
  return items.map((i) => ({ kind: i.kind, rank: i.rank, title: i.title }));
}

function show(label, rows) {
  console.log(`\n${label}`);
  rows.forEach((r, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. rank ${String(r.rank).padStart(3)}  ${r.kind}`);
  });
}

try {
  const page = await browser.newPage();
  const fixture = await signInForAudit(page, BASE);
  if (!fixture) throw new Error("could not sign in as the audit shop");
  businessId = fixture.business.id;

  const before = await prisma.business.findUnique({
    where: { id: businessId },
    select: { hoursJson: true },
  });
  originalHours = before?.hoursJson ?? null;

  /*
    The fixture's only lead is already booked, so nothing on its board is the
    unanswered-call work the night boost applies to. Plant one, and take it
    back out in the finally block so the other audits see the shop they expect.
  */
  const planted = await prisma.lead.create({
    data: {
      businessId,
      name: "Night Ranking Probe",
      phone: "+15555550188",
      serviceType: "No cooling",
      urgency: "flexible",
      status: "new",
    },
  });
  plantedLeadId = planted.id;

  await prisma.business.update({
    where: { id: businessId },
    data: { hoursJson: OPEN_ALL_DAY },
  });
  const open = await board(page);
  show("shop OPEN — hours cover the current moment", open);

  await prisma.business.update({
    where: { id: businessId },
    data: { hoursJson: CLOSED_ALL_DAY },
  });
  const shut = await board(page);
  show("shop SHUT — the after-hours window the product exists for", shut);

  const rankOf = (rows, kind) => rows.find((r) => r.kind === kind)?.rank ?? null;
  const posOf = (rows, kind) => {
    const at = rows.findIndex((r) => r.kind === kind);
    return at < 0 ? null : at + 1;
  };

  console.log("\nwhat moved");
  const kinds = [...new Set([...open, ...shut].map((r) => r.kind))];
  let moved = 0;
  for (const kind of kinds) {
    const a = rankOf(open, kind);
    const b = rankOf(shut, kind);
    if (a === null || b === null || a === b) continue;
    moved += 1;
    const direction = b < a ? "up" : "down";
    console.log(
      `  ${kind.padEnd(20)} rank ${a} → ${b} (${direction}), row ${posOf(open, kind)} → ${posOf(shut, kind)}`,
    );
  }
  if (!moved) {
    console.log("  nothing moved — the clock is not reaching the ranking");
    process.exitCode = 1;
  }
} finally {
  if (plantedLeadId) {
    await prisma.lead.delete({ where: { id: plantedLeadId } }).catch(() => undefined);
  }
  if (businessId) {
    await prisma.business
      .update({ where: { id: businessId }, data: { hoursJson: originalHours ?? "{}" } })
      .catch(() => undefined);
    console.log(`\nrestored hours and removed the planted lead for ${AUDIT_EMAIL}`);
  }
  await browser.close();
  await prisma.$disconnect().catch(() => undefined);
}
