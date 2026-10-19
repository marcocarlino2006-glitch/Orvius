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

test("a SQLite file can opt into the same concurrent adapter as Turso, at the path Prisma would use", async () => {
  const { resolveSqliteUrl } = await import("../src/lib/prisma.ts");
  assert.equal(resolveSqliteUrl("file:./dev.db", "/app"), "file:/app/prisma/dev.db");
  assert.equal(resolveSqliteUrl("file:ci.db", "/app/"), "file:/app/prisma/ci.db");
  assert.equal(resolveSqliteUrl("file:/data/orvius.db?connection_limit=1", "/app"), "file:/data/orvius.db");
  const src = readFileSync("src/lib/prisma.ts", "utf8");
  assert.match(src, /startsWith\("file:"\) && process\.env\.PRISMA_SQLITE_ADAPTER === "libsql"[\s\S]*new ConcurrentPrismaLibSql/);
});

test("load-test percentiles are nearest-rank", () => {
  const xs = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(percentile(xs, 50), 50);
  assert.equal(percentile(xs, 95), 95);
  assert.equal(percentile(xs, 100), 100);
  assert.equal(percentile([], 50), null);
});

test("paid voice runs are manual only, in a protected environment, bound to an authorization; labels and PR events never run them", () => {
  for (const file of [".github/workflows/voice-nightly.yml", ".github/workflows/voice-gate.yml"]) {
    const wf = readFileSync(file, "utf8");
    assert.doesNotMatch(wf, /schedule:/, `${file} has no schedule`);
    assert.doesNotMatch(wf, /pull_request_target|issue_comment|workflow_run|labeled|run-voice-gate/, `${file} has no trusted-event or label trigger`);
    assert.match(wf, /workflow_dispatch:\s*\n\s*inputs:\s*\n\s*authorization:/);
    const paid = wf.slice(wf.search(/\n  (gate|voice):/));
    assert.match(paid, /if: github\.event_name == 'workflow_dispatch'|^\n  voice:/);
    assert.match(paid, /environment: paid-voice-tests/);
    assert.match(paid, /ref: \$\{\{ fromJSON\(inputs\.authorization\)\.commit \}\}/, "checks out the authorized commit");
    assert.match(paid, /VOICE_TEST_AUTHORIZATION: \$\{\{ inputs\.authorization \}\}/);
    const install = paid.slice(paid.indexOf("npm ci"), paid.indexOf("npm ci") + 40);
    assert.doesNotMatch(install, /secrets\./, "no secret is in scope while dependencies install");
    assert.doesNotMatch(paid.slice(0, paid.indexOf("- name: Run authorized")), /secrets\./, "secrets appear only on the authorized run step");
    assert.doesNotMatch(wf, /backups\/|db-backup/);
  }
  const gate = readFileSync(".github/workflows/voice-gate.yml", "utf8");
  assert.match(gate, /reminder:[\s\S]*if: github\.event_name == 'pull_request'[\s\S]*::warning::/);
  const reminder = gate.slice(gate.indexOf("reminder:"), gate.indexOf("\n  gate:"));
  assert.doesNotMatch(reminder, /checkout|secrets\./, "the PR reminder neither checks out PR code nor sees secrets");
});

test("the paid voice authorization refuses anything the budget owner did not name", async () => {
  const { checkVoiceAuthorization, planWithinAuthorization } = await import("./lib/voice-authorization.mjs");
  const commit = "c".repeat(40);
  const ctx = { headCommit: commit, environment: "paid-voice-tests", receptionistPhoneId: "rec-test", callerPhoneId: "caller-test", transferNumber: null, now: Date.parse("2026-10-15T00:00:00Z") };
  const auth = {
    id: "VOICE-1",
    approvedBy: "owner@example.com",
    commit,
    environment: "paid-voice-tests",
    receptionistPhoneId: "rec-test",
    callerPhoneId: "caller-test",
    destinationAllowlist: ["+15555550100"],
    scenarioProfile: ["gate"],
    maxCalls: 9,
    maxMinutesPerCall: 3,
    budgetUsd: 12,
    abortOwner: "owner@example.com",
    cleanup: "restore-assistant-and-delete-test-assistant",
    evidence: "redacted",
    reconciliation: "budget owner compares the Vapi call log and bill with the results",
    expiresAt: "2026-10-16T00:00:00Z",
  };
  assert.equal(checkVoiceAuthorization(auth, ctx).ok, true);
  assert.deepEqual(checkVoiceAuthorization(null, ctx).problems, ["no authorization was given; paid voice tests are off"]);
  for (const field of ["maxCalls", "maxMinutesPerCall", "budgetUsd", "abortOwner", "destinationAllowlist", "scenarioProfile", "cleanup", "evidence", "reconciliation", "expiresAt", "approvedBy"]) {
    const { [field]: _, ...missing } = auth;
    assert.equal(checkVoiceAuthorization(missing, ctx).ok, false, `${field} is required, never defaulted`);
  }
  assert.equal(checkVoiceAuthorization({ ...auth, commit: "d".repeat(40) }, ctx).ok, false, "another commit");
  assert.equal(checkVoiceAuthorization(auth, { ...ctx, environment: null }).ok, false, "outside the protected environment");
  assert.equal(checkVoiceAuthorization(auth, { ...ctx, receptionistPhoneId: "prod-line" }).ok, false, "not the test-only number");
  assert.equal(checkVoiceAuthorization(auth, { ...ctx, now: Date.parse("2026-10-17T00:00:00Z") }).ok, false, "expired");
  assert.equal(checkVoiceAuthorization(auth, { ...ctx, transferNumber: "+15555550199" }).ok, false, "transfer stays off unless authorized");
  assert.equal(
    checkVoiceAuthorization({ ...auth, transfer: true, transferAuthorizedBy: "owner@example.com", destinationAllowlist: ["+15555550100", "+15555550199"] }, { ...ctx, transferNumber: "+15555550199" }).ok,
    true,
  );
  const gateScenario = { id: "gas-leak", gate: true };
  assert.deepEqual(planWithinAuthorization(auth, { destination: "+15555550100", scenarios: [gateScenario] }), []);
  assert.match(planWithinAuthorization(auth, { destination: "+15555550100", scenarios: [{ id: "chit-chat", gate: false }] })[0], /outside the authorized profile/);
  assert.match(planWithinAuthorization(auth, { destination: "+15555550111", scenarios: [gateScenario] })[0], /not on the consented destination allowlist/);
  assert.match(planWithinAuthorization({ ...auth, maxCalls: 1 }, { destination: "+15555550100", scenarios: [gateScenario, gateScenario] })[0], /allows 1/);
});

test("the simulator checks the authorization before any provider or app request", () => {
  const sim = readFileSync("scripts/voice-sim.mjs", "utf8");
  const check = sim.indexOf("checkVoiceAuthorization(raw");
  assert.ok(check > 0);
  for (const effect of ["await learnedScenarios()", 'vapi("/assistant"', "vapi(`/phone-number/${FROM_ID}`"]) {
    assert.ok(sim.indexOf(effect) > check, `${effect} comes after the authorization check`);
  }
  assert.match(sim, /spentUsd >= authorization\.budgetUsd/);
  assert.match(sim, /planWithinAuthorization\(authorization/);
});

test("porting steps ask for what a carrier needs and promise no date", () => {
  assert.match(readFileSync("src/components/connect-number.tsx", "utf8"), /<PortRequestForm \/>/);
  const panel = readFileSync("src/components/port-request-form.tsx", "utf8");
  assert.match(panel, /port-out PIN/i);
  assert.match(panel, /latest bill/);
  assert.match(panel, /Don&apos;t cancel your current service/);
  assert.doesNotMatch(panel, /\d+\s*(business )?days/);
});

test("the release identity names the built commit and never invents one", async () => {
  const { releaseIdentity } = await import("../src/lib/release.ts");
  const sha = "0123456789abcdef0123456789abcdef01234567";
  assert.deepEqual(releaseIdentity({ VERCEL_GIT_COMMIT_SHA: sha.toUpperCase(), VERCEL_GIT_COMMIT_REF: "main", VERCEL_ENV: "production", VERCEL_DEPLOYMENT_ID: "dpl_1" }), {
    commit: sha,
    ref: "main",
    environment: "production",
    deploymentId: "dpl_1",
  });
  const unknown = releaseIdentity({ NODE_ENV: "production", VERCEL_GIT_COMMIT_SHA: "not a sha" });
  assert.equal(unknown.commit, null);
  assert.equal(unknown.environment, "production-unknown-host");
});

test("prod:verify needs the promoted release's full commit and compares it to what production serves", async () => {
  const source = readFileSync(new URL("./prod-verify.mjs", import.meta.url), "utf8");
  assert.match(source, /releaseCheck\(json\?\.release, process\.env\.EXPECTED_COMMIT\)/, "the comparison reads the serving deployment, not the local checkout");
  assert.doesNotMatch(source, /git rev-parse/);
  const { releaseCheck } = await import("./lib/release-check.mjs");
  const sha = "a".repeat(40);
  assert.match(releaseCheck({ commit: sha }, "").detail, /EXPECTED_COMMIT must name the full 40-character commit/);
  assert.equal(releaseCheck({ commit: null }, sha).ok, false);
  assert.equal(releaseCheck({ commit: "b".repeat(40) }, sha).ok, false);
  assert.equal(releaseCheck({ commit: sha, environment: "production" }, sha.toUpperCase()).ok, true);
});
