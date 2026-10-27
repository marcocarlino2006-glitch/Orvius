import assert from "node:assert/strict";
import test from "node:test";
import { isDevAuthBypassEnabled } from "../src/lib/dev-auth.ts";

function withEnv(env, fn) {
  const keys = ["ORVIUS_DEV_AUTH_BYPASS", "VERCEL_ENV", "NODE_ENV"];
  const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, env);
  try {
    return fn();
  } finally {
    for (const k of keys) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
  }
}

test("dev sign-in bypass needs the flag", () => {
  assert.equal(withEnv({ NODE_ENV: "development" }, isDevAuthBypassEnabled), false);
  assert.equal(withEnv({ NODE_ENV: "development", ORVIUS_DEV_AUTH_BYPASS: "1" }, isDevAuthBypassEnabled), true);
});

test("dev sign-in bypass is off on every hosted Vercel deploy", () => {
  for (const vercelEnv of ["production", "preview"]) {
    assert.equal(
      withEnv({ ORVIUS_DEV_AUTH_BYPASS: "1", VERCEL_ENV: vercelEnv, NODE_ENV: "production" }, isDevAuthBypassEnabled),
      false,
      vercelEnv,
    );
  }
});

test("dev sign-in bypass is off for self-hosted production", () => {
  assert.equal(withEnv({ ORVIUS_DEV_AUTH_BYPASS: "1", NODE_ENV: "production" }, isDevAuthBypassEnabled), false);
});

test("vercel dev can use the bypass", () => {
  assert.equal(
    withEnv({ ORVIUS_DEV_AUTH_BYPASS: "1", VERCEL_ENV: "development", NODE_ENV: "development" }, isDevAuthBypassEnabled),
    true,
  );
});
