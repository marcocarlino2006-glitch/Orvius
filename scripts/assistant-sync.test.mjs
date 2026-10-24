import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const { syncLiveAssistants, liveAssistantWhere } = await import("../src/lib/sync-live-assistants.ts");
const { prisma } = await import("../src/lib/prisma.ts");
const { runAssistantSync } = await import("./scheduled-drain.mjs");

test("assistant sync resumes after the last shop and never calls a deployment on the wrong release", async () => {
  const SHA = "a".repeat(40);
  const env = { CRON_SECRET: "s", DRAIN_TARGET_ENV: "production", DRAIN_TARGET_URL: "https://app.example.test", DRAIN_EXPECTED_RELEASE: SHA };
  const targets = { production: ["app.example.test"], staging: [] };
  const calls = [];
  let n = 0;
  const impl = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith("/api/health")) return new Response(JSON.stringify({ release: { environment: "production", commit: SHA } }), { status: 200 });
    n += 1;
    if (n === 1) return new Response(JSON.stringify({ ok: false, done: false, after: "shopa", current: 1, updated: 2, skipped: 0 }), { status: 200 });
    return new Response(JSON.stringify({ ok: true, done: true, after: null, current: 3, updated: 0, skipped: 1 }), { status: 200 });
  };
  const r = await runAssistantSync({ env, targets, fetchImpl: impl, timeoutMs: 1000 });
  assert.equal(r.ok, true);
  assert.equal(r.done, true);
  assert.equal(r.passes, 2);
  assert.equal(r.updated, 2);
  assert.equal(r.current, 4);
  assert.equal(r.skipped, 1);
  assert.ok(calls.some((u) => u.endsWith("/api/cron/assistants")));
  assert.ok(calls.some((u) => u.endsWith("/api/cron/assistants?after=shopa")));

  const wrong = [];
  const bad = await runAssistantSync({
    env,
    targets,
    timeoutMs: 1000,
    fetchImpl: async (url) => {
      wrong.push(String(url));
      return new Response(JSON.stringify({ release: { environment: "production", commit: "b".repeat(40) } }), { status: 200 });
    },
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.stage, "identity");
  assert.ok(wrong.every((u) => u.endsWith("/api/health")));
});

test("the assistant sweep rewrites live shops in order, resumes, and does nothing else", async () => {
  assert.deepEqual(liveAssistantWhere, { isActive: true, vapiAssistantId: { not: null }, environment: { not: "test" } });
  assert.match(read("src/app/api/cron/notifications/route.ts"), /isActive: true, vapiAssistantId: \{ not: null \}, environment: \{ not: "test" \}/);

  const route = read("src/app/api/cron/assistants/route.ts");
  assert.match(route, /syncLiveAssistants\(\{ after \}\)/);
  assert.doesNotMatch(route, /claimDailyRun|billPreviousMonthOverage|suspendUnpaidLines|sendOwnerNudges|markCronRan|processNotificationQueue/);
  const yml = read(".github/workflows/assistant-sync.yml");
  assert.match(yml, /workflow_dispatch:/);
  assert.doesNotMatch(yml, /schedule:/);
  assert.match(yml, /scheduled-drain\.mjs assistants/);

  const prefix = `asst-sync-${Date.now()}`;
  const narrow = { slug: { startsWith: prefix } };
  const ids = [];
  try {
    for (let i = 0; i < 10; i++) {
      const row = await prisma.business.create({
        data: {
          name: `Sync ${i}`,
          slug: `${prefix}-${String(i).padStart(2, "0")}`,
          environment: "production",
          vapiAssistantId: `asst-${prefix}-${i}`,
          ownerEmail: `${prefix}-${i}@example.test`,
        },
        select: { id: true },
      });
      ids.push(row.id);
    }
    const excluded = await prisma.business.create({
      data: { name: "Test shop", slug: `${prefix}-test`, environment: "test", vapiAssistantId: `asst-${prefix}-test`, ownerEmail: `${prefix}-test@example.test` },
      select: { id: true },
    });
    const inactive = await prisma.business.create({
      data: { name: "Off", slug: `${prefix}-off`, environment: "production", isActive: false, vapiAssistantId: `asst-${prefix}-off`, ownerEmail: `${prefix}-off@example.test` },
      select: { id: true },
    });
    const noline = await prisma.business.create({
      data: { name: "No line", slug: `${prefix}-none`, environment: "production", ownerEmail: `${prefix}-none@example.test` },
      select: { id: true },
    });
    ids.sort();
    const seen = [];
    let nowMs = 1_000;
    const sync = async (shop) => {
      seen.push(shop.id);
      if (seen.length >= 8) nowMs = 1_000 + 45_000;
      return "updated";
    };
    const first = await syncLiveAssistants({ narrow, now: () => nowMs, sync });
    assert.equal(first.done, false);
    assert.equal(first.updated, 8);
    assert.equal(first.after, ids[7]);
    assert.deepEqual(seen.slice().sort(), ids.slice(0, 8));
    for (const id of [excluded.id, inactive.id, noline.id]) assert.equal(seen.includes(id), false);

    seen.length = 0;
    nowMs = 1_000;
    const second = await syncLiveAssistants({ narrow, after: first.after, now: () => nowMs, sync });
    assert.equal(second.done, true);
    assert.equal(second.after, null);
    assert.equal(second.updated, 2);
    assert.deepEqual(seen.slice().sort(), ids.slice(8));

    seen.length = 0;
    const boom = ids[0];
    const thrown = await syncLiveAssistants({
      narrow,
      sync: async (shop) => {
        seen.push(shop.id);
        if (shop.id === boom) throw new Error("vapi down");
        return "current";
      },
    });
    assert.equal(thrown.done, true);
    assert.equal(thrown.skipped, 1);
    assert.equal(thrown.current, 9);
    assert.equal(seen.length, 10);

    seen.length = 0;
    const none = await syncLiveAssistants({ narrow, budgetMs: 0, now: () => 5, sync });
    assert.equal(none.done, false);
    assert.equal(none.after, null);
    assert.equal(seen.length, 0);
  } finally {
    await prisma.business.deleteMany({ where: { slug: { startsWith: prefix } } });
  }
});

test("the assistant route refuses a request that is not for this deployment", async () => {
  const SHA = "c".repeat(40);
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
    CRON_SECRET: process.env.CRON_SECRET,
  };
  const { GET } = await import("../src/app/api/cron/assistants/route.ts");
  const { NextRequest } = await import("next/server");
  const call = (headers) => GET(new NextRequest("https://app.example.test/api/cron/assistants", { headers }));
  try {
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_GIT_COMMIT_SHA = SHA;
    delete process.env.CRON_SECRET;
    assert.equal((await call({})).status, 503);

    process.env.CRON_SECRET = "cron-test";
    assert.equal((await call({ authorization: "Bearer no" })).status, 401);
    assert.equal((await call({ authorization: "Bearer cron-test", "x-orvius-target": "staging", "x-orvius-release": SHA })).status, 409);
    const rejected = await GET(new NextRequest("https://app.example.test/api/cron/assistants?after=not-a-cursor", {
      headers: { authorization: "Bearer cron-test", "x-orvius-target": "production", "x-orvius-release": SHA },
    }));
    assert.equal(rejected.status, 400);
    // An authorized request walks live shops. Only do that when there are none, so the test cannot rewrite a receptionist.
    const live = await prisma.business.count({ where: liveAssistantWhere });
    if (live === 0) {
      const ok = await call({ authorization: "Bearer cron-test", "x-orvius-target": "production", "x-orvius-release": SHA });
      assert.equal(ok.status, 200);
      const body = await ok.json();
      assert.deepEqual(
        { ok: body.ok, done: body.done, current: body.current, updated: body.updated, skipped: body.skipped, after: body.after },
        { ok: true, done: true, current: 0, updated: 0, skipped: 0, after: null },
      );
    }
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
