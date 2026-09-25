#!/usr/bin/env node
/*
 * Running Orvius in public: a status page that never shows green it hasn't
 * seen, a changelog of only what shipped, a backup that is proven by
 * restoring it, and a load test whose numbers are computed the same way twice.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@libsql/client";

import {
  PROVIDER_SOURCES,
  fetchProviderStatuses,
  parseStatuspage,
  stateFromIndicator,
  summarizeProviders,
} from "../src/lib/provider-status.ts";
import { CHANGELOG } from "../src/lib/changelog.ts";
import { backup, restoreDrill, resolveDatabaseUrl } from "./db-backup.mjs";
import { percentile } from "./load-test.mjs";

test("statuspage indicators map to plain states, and anything unrecognised is unknown, not green", () => {
  assert.equal(stateFromIndicator("none"), "operational");
  assert.equal(stateFromIndicator("minor"), "degraded");
  assert.equal(stateFromIndicator("major"), "outage");
  assert.equal(stateFromIndicator("critical"), "outage");
  assert.equal(stateFromIndicator(undefined), "unknown");
  assert.deepEqual(parseStatuspage({ status: { indicator: "minor", description: "Partially Degraded Service" } }), {
    state: "degraded",
    description: "Partially Degraded Service",
  });
  assert.deepEqual(parseStatuspage("<html>"), { state: "unknown", description: null });
});

test("the summary names the worst provider and never folds unreachable into all-good", () => {
  const p = (name, state) => ({ id: name, name, role: "", page: "", state, description: null });
  assert.equal(summarizeProviders([p("A", "operational"), p("B", "operational")]).state, "operational");
  const unknown = summarizeProviders([p("A", "operational"), p("Vapi", "unknown")]);
  assert.equal(unknown.state, "unknown");
  assert.match(unknown.line, /Vapi/);
  const outage = summarizeProviders([p("A", "degraded"), p("Twilio", "outage")]);
  assert.equal(outage.state, "outage");
  assert.match(outage.line, /Twilio/);
});

test("a provider that times out or errors reads as unknown; Vapi, with no JSON, is always a link", async () => {
  const fake = async (url) => {
    if (url.includes("twilio")) throw new Error("timeout");
    if (url.includes("deepgram")) return new Response("nope", { status: 503 });
    return Response.json({ status: { indicator: "none", description: "All Systems Operational" } });
  };
  const list = await fetchProviderStatuses(fake, 50);
  const by = Object.fromEntries(list.map((s) => [s.id, s]));
  assert.equal(by.twilio.state, "unknown");
  assert.equal(by.deepgram.state, "unknown");
  assert.equal(by.openai.state, "operational");
  assert.equal(by.vapi.state, "unknown");
  assert.ok(PROVIDER_SOURCES.every((s) => s.page.startsWith("https://")));
});

test("status and changelog are public, linked, and in the sitemap", () => {
  assert.ok(existsSync("src/app/status/page.tsx"));
  assert.ok(existsSync("src/app/changelog/page.tsx"));
  const sitemap = readFileSync("src/app/sitemap.ts", "utf8");
  assert.match(sitemap, /"\/status"/);
  assert.match(sitemap, /"\/changelog"/);
  const footer = readFileSync("src/components/marketing-shell.tsx", "utf8");
  assert.match(footer, /href="\/status"/);
  assert.match(footer, /href="\/changelog"/);
});

test("changelog is newest first, dated, and makes no promises about the future", () => {
  assert.ok(CHANGELOG.length > 0);
  for (let i = 1; i < CHANGELOG.length; i++) assert.ok(CHANGELOG[i - 1].date >= CHANGELOG[i].date);
  for (const e of CHANGELOG) {
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(e.items.length > 0);
    for (const item of e.items) assert.doesNotMatch(item, /coming soon|soon|will be|roadmap|planned/i);
  }
});

test("a backup restores into a fresh database with every row", async () => {
  const src = createClient({ url: ":memory:" });
  await src.execute('CREATE TABLE "Lead" ("id" TEXT PRIMARY KEY, "name" TEXT, "blob" BLOB, "n" INTEGER)');
  await src.execute('CREATE INDEX "Lead_name_idx" ON "Lead"("name")');
  await src.execute('CREATE TABLE "Empty" ("id" TEXT PRIMARY KEY)');
  await src.batch(
    Array.from({ length: 450 }, (_, i) => ({
      sql: 'INSERT INTO "Lead" VALUES (?, ?, ?, ?)',
      args: [`l${i}`, i % 3 ? `Caller "${i}"` : null, i === 0 ? new Uint8Array([1, 2, 3]) : null, i],
    })),
    "write",
  );
  const dump = JSON.parse(JSON.stringify(await backup(src)));
  src.close();
  assert.equal(dump.format, "orvius-backup/1");
  assert.equal(dump.tables.find((t) => t.name === "Lead").rows.length, 450);
  const result = await restoreDrill(dump);
  assert.deepEqual(result.mismatches, []);
  assert.equal(result.rows, 450);
  assert.equal(result.tables, 2);
});

test("a restore drill fails loudly on a corrupt backup instead of reporting success", async () => {
  const dump = {
    format: "orvius-backup/1",
    tables: [{ name: "T", sql: 'CREATE TABLE "T" ("id" TEXT PRIMARY KEY)', columns: ["id"], rows: [["a"], ["a"]] }],
  };
  await assert.rejects(restoreDrill(dump), /UNIQUE|constraint/i);
});

test("backups resolve SQLite from prisma/ like Prisma does, and stay out of git", () => {
  assert.match(resolveDatabaseUrl("file:./dev.db").url, /\/prisma\/dev\.db$/);
  assert.equal(resolveDatabaseUrl("file:/tmp/x.db").url, "file:/tmp/x.db");
  assert.deepEqual(resolveDatabaseUrl("libsql://db.turso.io?authToken=t"), { url: "libsql://db.turso.io", authToken: "t" });
  assert.throws(() => resolveDatabaseUrl(""), /not set/);
  assert.match(readFileSync(".gitignore", "utf8"), /^\/backups\/$/m);
});

test("load-test percentiles are nearest-rank", () => {
  const xs = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(percentile(xs, 50), 50);
  assert.equal(percentile(xs, 95), 95);
  assert.equal(percentile(xs, 100), 100);
  assert.equal(percentile([], 50), null);
});

test("nightly voice run skips honestly without secrets and never uploads shop data", () => {
  const wf = readFileSync(".github/workflows/voice-nightly.yml", "utf8");
  assert.match(wf, /schedule:/);
  assert.match(wf, /VOICE_SIM_RECEPTIONIST_PHONE_ID/);
  assert.match(wf, /run=false/);
  assert.match(wf, /sim:voice -- --json voice-results\.json/);
  assert.doesNotMatch(wf, /backups\/|db-backup/);
});

test("porting steps ask for what a carrier needs and promise no date", () => {
  const panel = readFileSync("src/components/capture-setup-panel.tsx", "utf8");
  assert.match(panel, /port-out PIN/);
  assert.match(panel, /latest phone bill/);
  assert.match(panel, /Don&apos;t cancel your current service/);
  assert.doesNotMatch(panel, /\d+\s*(business )?days/);
});
