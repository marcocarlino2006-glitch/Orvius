#!/usr/bin/env node
/*
 * Release control, offline: builds stay pure, paid voice runs never start from a
 * PR, schedule or label, effectful scheduled sweeps need the one target the
 * owner listed in ops/drain-targets.json, serving the release the caller runs
 * from (checked by the caller and again by the server before any effect), and
 * verification compares the serving deployment's own identity.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { mock, test } from "node:test";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const SHA = "e".repeat(40);

let drained = 0;
let lineWatched = 0;
mock.module(new URL("../src/lib/drain-owner-alerts.ts", import.meta.url).href, { namedExports: { drainOwnerAlerts: async () => { drained++; } } });
mock.module(new URL("../src/lib/cron-runs.ts", import.meta.url).href, { namedExports: { markCronRan: async () => {} } });
mock.module(new URL("../src/lib/line-watch-sweep.ts", import.meta.url).href, { namedExports: { runLineWatchSweep: async () => { lineWatched++; return { unrecovered: 0 }; } } });

const { drainPlan, runScheduledDrain } = await import("./scheduled-drain.mjs");
const { scheduledTargetRefusal } = await import("../src/lib/scheduled-target.ts");

test("automatic builds only generate and compile", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts.build, "next build");
  for (const hook of ["prebuild", "postbuild", "postinstall", "vercel-build"]) assert.equal(pkg.scripts[hook], undefined, hook);
  const vercel = JSON.parse(read("vercel.json"));
  assert.equal(vercel.buildCommand, "npm run db:generate && npm run build");
  assert.equal(pkg.scripts["db:generate"], "prisma generate");
  const nextConfig = readdirSync(new URL("../", import.meta.url)).find((f) => /^next\.config\./.test(f));
  assert.doesNotMatch(read(nextConfig), /turso-migrate|child_process|db push|prisma migrate/);
});

test("no workflow runs untrusted PR code with secrets, and paid voice is manual only", () => {
  const dir = new URL("../.github/workflows/", import.meta.url);
  for (const file of readdirSync(dir)) {
    const src = readFileSync(new URL(file, dir), "utf8");
    assert.doesNotMatch(src, /pull_request_target|workflow_run|issue_comment/, `${file}: no trusted-event workaround`);
    assert.doesNotMatch(src, /github\.event\.label|contains\(github\.event\.pull_request\.labels/, `${file}: a label is not authorization`);
  }
  const nightly = read(".github/workflows/voice-nightly.yml");
  assert.doesNotMatch(nightly, /schedule:|pull_request/);
  const gate = read(".github/workflows/voice-gate.yml");
  const reminder = gate.slice(gate.indexOf("  reminder:"), gate.indexOf("  gate:"));
  assert.doesNotMatch(reminder, /secrets\.|checkout/, "the PR job has no secrets and runs no PR code");
  assert.match(gate.slice(gate.indexOf("  gate:")), /if: github\.event_name == 'workflow_dispatch'[\s\S]*environment: paid-voice-tests/);
  for (const src of [nightly, gate]) assert.match(src, /ref: \$\{\{ fromJSON\(inputs\.authorization\)\.commit \}\}/);
});

test("effectful scheduled sweeps name the one listed target and the release they run from", () => {
  for (const file of ["alert-drain.yml", "line-watch.yml", "sweep-heartbeat.yml"]) {
    const src = read(`.github/workflows/${file}`);
    assert.doesNotMatch(src, /api\.orvius\.im|\|\| 'https/, `${file}: no implicit production fallback`);
    assert.doesNotMatch(src, /curl .*api\/cron/, `${file}: sweeps go through scheduled-drain.mjs`);
    assert.match(src, /DRAIN_TARGET_URL: https:\/\/orvius\.im/, `${file}: the one production target, named in the open`);
    assert.match(src, /DRAIN_TARGET_ENV: production/, `${file}: the one environment, named in the open`);
    assert.match(
      src,
      /DRAIN_EXPECTED_RELEASE: \$\{\{ github\.sha \}\}/,
      `${file}: the approved release is the commit the run checked out`,
    );
  }
  assert.deepEqual(
    JSON.parse(read("ops/drain-targets.json")),
    { production: ["orvius.im"], preview: [], staging: [] },
    "the owner has listed exactly the production deployment, and no other",
  );
});

const targets = { production: ["app.example.test"], staging: ["staging.example.test"] };
const env = { CRON_SECRET: "s", DRAIN_TARGET_ENV: "production", DRAIN_TARGET_URL: "https://app.example.test", DRAIN_EXPECTED_RELEASE: SHA };

test("the caller refuses before any request when target, listing or release is missing or wrong", () => {
  assert.equal(drainPlan("alert-drain", env, targets).ok, true);
  for (const [bad, why] of [
    [{ DRAIN_TARGET_URL: "" }, /no default target/],
    [{ DRAIN_TARGET_ENV: "" }, /DRAIN_TARGET_ENV/],
    [{ DRAIN_TARGET_URL: "https://elsewhere.example.test" }, /not listed for production/],
    [{ DRAIN_TARGET_URL: "http://app.example.test" }, /https/],
    [{ DRAIN_TARGET_ENV: "staging" }, /not listed for staging/],
    [{ DRAIN_EXPECTED_RELEASE: "abc" }, /full approved release/],
    [{ CRON_SECRET: "" }, /CRON_SECRET/],
  ]) {
    const plan = drainPlan("alert-drain", { ...env, ...bad }, targets);
    assert.equal(plan.ok, false);
    assert.match(plan.reason, why);
  }
  assert.match(drainPlan("backup", env, targets).reason, /unknown sweep/);
});

function fakeFetch(health) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url, headers: init.headers ?? {} });
    if (url.endsWith("/api/health")) return new Response(JSON.stringify(health), { status: 200 });
    return new Response('{"ok":true}', { status: 200 });
  };
  return { calls, impl };
}

test("a deployment that is the wrong environment or release gets no sweep request", async () => {
  for (const release of [{ environment: "preview", commit: SHA }, { environment: "production", commit: "f".repeat(40) }, { environment: "production", commit: null }, undefined]) {
    const f = fakeFetch({ ok: true, release });
    const r = await runScheduledDrain("alert-drain", { env, targets, fetchImpl: f.impl });
    assert.equal(r.ok, false);
    assert.equal(r.stage, "identity");
    assert.deepEqual(f.calls.map((c) => new URL(c.url).pathname), ["/api/health"], "only the read-only identity check");
  }
  const none = fakeFetch({});
  assert.equal((await runScheduledDrain("alert-drain", { env: { ...env, DRAIN_TARGET_URL: "" }, targets, fetchImpl: none.impl })).stage, "plan");
  assert.equal(none.calls.length, 0, "a bad plan makes no request at all");
});

test("the approved target gets the sweep, carrying the target and release for the server to recheck", async () => {
  const f = fakeFetch({ release: { environment: "production", commit: SHA } });
  const r = await runScheduledDrain("line-watch", { env, targets, fetchImpl: f.impl });
  assert.equal(r.ok, true);
  const sweep = f.calls[1];
  assert.equal(new URL(sweep.url).pathname, "/api/cron/line-watch");
  assert.equal(sweep.headers["x-orvius-target"], "production");
  assert.equal(sweep.headers["x-orvius-release"], SHA);
});

test("the server refuses a sweep meant for another environment or release before any effect", async () => {
  const serving = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: SHA };
  const h = (o) => new Headers(o);
  assert.equal(scheduledTargetRefusal(h({ "x-orvius-target": "production", "x-orvius-release": SHA }), serving), null);
  assert.match(scheduledTargetRefusal(h({}), serving), /x-orvius-target is required/);
  assert.match(scheduledTargetRefusal(h({ "x-orvius-target": "production" }), serving), /x-orvius-release is required/);
  assert.match(scheduledTargetRefusal(h({ "x-orvius-target": "staging", "x-orvius-release": SHA }), serving), /not staging/);
  assert.match(scheduledTargetRefusal(h({ "x-orvius-target": "production", "x-orvius-release": "1".repeat(40) }), serving), /serves/);

  const saved = { ...process.env };
  Object.assign(process.env, { NODE_ENV: "production", CRON_SECRET: "cron-test", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: SHA, ALLOW_UNAUTHENTICATED_ACCESS: "" });
  try {
    const alert = await import("../src/app/api/cron/alert-drain/route.ts");
    const watch = await import("../src/app/api/cron/line-watch/route.ts");
    const { NextRequest } = await import("next/server");
    const req = (path, headers) => new NextRequest(`https://app.example.test/api/cron/${path}`, { headers: { authorization: "Bearer cron-test", ...headers } });
    const wrong = { "x-orvius-target": "staging", "x-orvius-release": SHA };
    assert.equal((await alert.GET(req("alert-drain", wrong))).status, 409);
    assert.equal((await watch.GET(req("line-watch", {}))).status, 409);
    assert.equal(drained + lineWatched, 0, "no effect ran");
    const right = { "x-orvius-target": "production", "x-orvius-release": SHA };
    assert.equal((await alert.GET(req("alert-drain", right))).status, 200);
    assert.equal(drained, 1);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

test("rolling code back is documented as not rolling data or payment history back", () => {
  assert.match(read("scripts/turso-migrate.mjs"), /Rolling code back does not roll schema or payment data back/);
  assert.match(read("docs/RELEASE-CANDIDATE.md"), /## Rollback/);
});
