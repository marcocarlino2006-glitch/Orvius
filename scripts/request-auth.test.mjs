/*
 * Who is allowed to drive this system without a credential.
 *
 * Four entry points answered that question with isProduction(), which reports
 * how the code was built and not what it is about to write to. A dev server
 * pointed at the Turso URL is a development process making production
 * changes, and the Vapi webhook, the Twilio SMS webhook, every admin route and
 * the demo endpoint would each have served it unauthenticated — the demo
 * endpoint creates a shop, a call and a lead, and texts an owner.
 *
 * The cron route was worse in a different way: its guard was conditional on
 * CRON_SECRET existing, so production without the secret ran no check at all.
 *
 * These tests set the environment each case describes and ask the real
 * predicates, so the decision table is graded rather than the source text.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  getBearerToken,
  secretsMatch,
  verifyAdminRequest,
} from "../src/lib/env.ts";
import {
  isLocalDatabase,
  isProduction,
  isUnauthenticatedAccessAllowed,
} from "../src/lib/runtime.ts";
import {
  validateTwilioRequest,
  verifyVapiWebhookSecret,
} from "../src/lib/webhook-auth.ts";

const TURSO = "libsql://orvius-prod.turso.io?authToken=x";
const LOCAL = "file:./dev.db";

function withEnv(vars, run) {
  const previous = new Map(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return run();
  } finally {
    for (const [k, v] of previous) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const req = (headers = {}) =>
  new Request("http://localhost/api/admin/anything", { headers });

test("a development build pointed at the live database is not local", () => {
  withEnv({ NODE_ENV: "development", VERCEL_ENV: undefined, DATABASE_URL: TURSO }, () => {
    assert.equal(isProduction(), false, "the runtime flag says development");
    assert.equal(isLocalDatabase(), false);
    assert.equal(
      isUnauthenticatedAccessAllowed(),
      false,
      "which is exactly the case the old guard waved through",
    );
  });
});

test("a development build on a throwaway database still is", () => {
  withEnv({ NODE_ENV: "development", VERCEL_ENV: undefined, DATABASE_URL: LOCAL }, () => {
    assert.equal(isUnauthenticatedAccessAllowed(), true, "dogfooding keeps working");
  });
});

test("production is never local, whatever the database says", () => {
  withEnv({ NODE_ENV: "production", VERCEL_ENV: undefined, DATABASE_URL: LOCAL }, () => {
    assert.equal(isUnauthenticatedAccessAllowed(), false);
  });
  withEnv({ NODE_ENV: "development", VERCEL_ENV: "production", DATABASE_URL: LOCAL }, () => {
    assert.equal(isUnauthenticatedAccessAllowed(), false);
  });
});

test("an unset database URL is not treated as local", () => {
  withEnv({ NODE_ENV: "development", VERCEL_ENV: undefined, DATABASE_URL: undefined }, () => {
    assert.equal(isLocalDatabase(), false, "unknown is not safe");
  });
});

test("the Vapi webhook will not take an unsigned post against live data", () => {
  withEnv(
    {
      NODE_ENV: "development",
      VERCEL_ENV: undefined,
      VAPI_WEBHOOK_SECRET: undefined,
      DATABASE_URL: TURSO,
    },
    () => assert.equal(verifyVapiWebhookSecret(null), false),
  );

  withEnv(
    {
      NODE_ENV: "development",
      VERCEL_ENV: undefined,
      VAPI_WEBHOOK_SECRET: undefined,
      DATABASE_URL: LOCAL,
    },
    () => assert.equal(verifyVapiWebhookSecret(null), true),
  );
});

test("a configured Vapi secret is compared, and a wrong one is refused", () => {
  withEnv({ VAPI_WEBHOOK_SECRET: "right", DATABASE_URL: LOCAL, NODE_ENV: "development" }, () => {
    assert.equal(verifyVapiWebhookSecret("right"), true);
    assert.equal(verifyVapiWebhookSecret("wrong"), false);
    assert.equal(
      verifyVapiWebhookSecret("rightright"),
      false,
      "a prefix is not a match",
    );
    assert.equal(verifyVapiWebhookSecret(null), false);
  });
});

test("Twilio posts without a signature stop at the database boundary", () => {
  const call = () =>
    validateTwilioRequest({
      signature: null,
      url: "http://x/api/webhooks/twilio/sms",
      formEntries: {},
    });

  withEnv(
    { NODE_ENV: "development", VERCEL_ENV: undefined, TWILIO_AUTH_TOKEN: undefined, DATABASE_URL: TURSO },
    () => assert.equal(call(), false),
  );
  withEnv(
    { NODE_ENV: "development", VERCEL_ENV: undefined, TWILIO_AUTH_TOKEN: undefined, DATABASE_URL: LOCAL },
    () => assert.equal(call(), true),
  );
  withEnv(
    { NODE_ENV: "development", VERCEL_ENV: undefined, TWILIO_AUTH_TOKEN: "token", DATABASE_URL: TURSO },
    () => assert.equal(call(), false, "a token without a signature proves nothing"),
  );
});

test("admin routes with no key set are open only on a local database", () => {
  withEnv(
    { NODE_ENV: "development", VERCEL_ENV: undefined, ORVIUS_ADMIN_KEY: undefined, DATABASE_URL: TURSO },
    () => assert.equal(verifyAdminRequest(req()), false),
  );
  withEnv(
    { NODE_ENV: "development", VERCEL_ENV: undefined, ORVIUS_ADMIN_KEY: undefined, DATABASE_URL: LOCAL },
    () => assert.equal(verifyAdminRequest(req()), true),
  );
});

test("a configured admin key is accepted by either header and nothing else", () => {
  withEnv({ ORVIUS_ADMIN_KEY: "s3cret", NODE_ENV: "production", DATABASE_URL: TURSO }, () => {
    assert.equal(verifyAdminRequest(req({ authorization: "Bearer s3cret" })), true);
    assert.equal(verifyAdminRequest(req({ "x-orvius-admin-key": "s3cret" })), true);
    assert.equal(verifyAdminRequest(req({ authorization: "Bearer nope" })), false);
    assert.equal(verifyAdminRequest(req({ authorization: "s3cret" })), false, "Bearer is required");
    assert.equal(verifyAdminRequest(req()), false);
  });
});

test("secret comparison is length-blind and exact", () => {
  assert.equal(secretsMatch("a", "a"), true);
  assert.equal(secretsMatch("a", "b"), false);
  assert.equal(secretsMatch("short", "a-much-longer-secret"), false);
  assert.equal(secretsMatch("", "x"), false);
  assert.equal(secretsMatch(null, "x"), false);
  assert.equal(secretsMatch("x", undefined), false);
});

test("bearer tokens are read only from a Bearer header", () => {
  assert.equal(getBearerToken(req({ authorization: "Bearer abc" })), "abc");
  assert.equal(getBearerToken(req({ authorization: "Basic abc" })), null);
  assert.equal(getBearerToken(req()), null);
});

test("the cron drain refuses to run in production without a secret", async () => {
  /*
    Vercel only attaches the bearer header when CRON_SECRET is set, so an
    unset secret and an unauthenticated caller are the same condition. The
    route answers 503 rather than 401 because the fault is ours, and
    deploy:check requires the secret so this cannot quietly stop the queue.
  */
  const { GET } = await import("../src/app/api/cron/notifications/route.ts");

  const res = await withEnv(
    { NODE_ENV: "production", CRON_SECRET: undefined, ORVIUS_ADMIN_KEY: undefined },
    () => GET(new Request("http://localhost/api/cron/notifications")),
  );

  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, "CRON_SECRET is not configured");
});

test("the cron drain refuses a caller presenting the wrong secret", async () => {
  const { GET } = await import("../src/app/api/cron/notifications/route.ts");

  const res = await withEnv(
    { NODE_ENV: "production", CRON_SECRET: "the-real-one", ORVIUS_ADMIN_KEY: undefined },
    () =>
      GET(
        new Request("http://localhost/api/cron/notifications", {
          headers: { authorization: "Bearer guess" },
        }),
      ),
  );

  assert.equal(res.status, 401);
});

test("deploy:check treats CRON_SECRET as required", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("./deploy-check.mjs", import.meta.url),
    "utf8",
  );
  const required = source.match(/const required = \[([\s\S]*?)\]/);
  assert.ok(required, "deploy-check still declares a required list");
  assert.ok(
    required[1].includes("CRON_SECRET"),
    "a missing secret must be caught before deploy, not after the queue goes quiet",
  );
});
