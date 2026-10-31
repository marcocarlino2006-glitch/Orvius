import assert from "node:assert/strict";
import { mock, test } from "node:test";

const RELEASE = "a".repeat(40);
const PLAN = "c".repeat(64);
let applied = 0;
let turnedOn = 0;

mock.module(new URL("../src/lib/platform-audit-schema.ts", import.meta.url).href, {
  namedExports: {
    approvalOk: (value) => typeof value === "string" && value.includes("PlatformAuditEvent"),
    backupRefOk: (value) => typeof value === "string" && value.startsWith("actions-run/"),
    platformAuditPlanSha256: () => PLAN,
    ensurePlatformAuditEvent: async () => {
      applied += 1;
      return { tables: ["PlatformAuditEvent"], alreadyPresent: false, ledgerId: 1, planSha256: PLAN };
    },
  },
});

mock.module(new URL("../src/lib/network-choice.ts", import.meta.url).href, {
  namedExports: {
    turnOnNeverChosenShops: async () => {
      turnedOn += 1;
      return 2;
    },
  },
});

const { NextRequest } = await import("next/server");
const { GET, POST } = await import("../src/app/api/cron/platform-audit-schema/route.ts");

function withProd(fn) {
  const saved = { ...process.env };
  process.env.NODE_ENV = "production";
  process.env.CRON_SECRET = "cron-test";
  process.env.VERCEL_ENV = "production";
  process.env.VERCEL_GIT_COMMIT_SHA = RELEASE;
  delete process.env.ALLOW_UNAUTHENTICATED_ACCESS;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
      Object.assign(process.env, saved);
    });
}

const right = {
  authorization: "Bearer cron-test",
  "x-orvius-target": "production",
  "x-orvius-release": RELEASE,
  "x-orvius-approval": "Admin audit: PlatformAuditEvent on production",
  "x-orvius-backup-ref": "actions-run/55",
  "x-orvius-plan-sha256": PLAN,
};

function post(headers) {
  return POST(new NextRequest("https://orvius.im/api/cron/platform-audit-schema", { method: "POST", headers }));
}

test("anonymous callers cannot create the admin audit table", async () => {
  await withProd(async () => {
    assert.equal((await GET(new NextRequest("https://orvius.im/api/cron/platform-audit-schema"))).status, 401);
    assert.equal((await post({})).status, 401);
    assert.equal(applied, 0);
  });
});

test("the admin audit table is created only for this deployment, after a backup and the reviewed checksum", async () => {
  await withProd(async () => {
    assert.equal((await post({ ...right, "x-orvius-target": "staging" })).status, 409);
    assert.equal((await post({ ...right, "x-orvius-plan-sha256": "d".repeat(64) })).status, 409);
    assert.equal(applied, 0);
    const ok = await post(right);
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.deepEqual(body.tables, ["PlatformAuditEvent"]);
    assert.equal(body.networkTurnedOn, 2);
    assert.equal(applied, 1);
    assert.equal(turnedOn, 1);
  });
});
