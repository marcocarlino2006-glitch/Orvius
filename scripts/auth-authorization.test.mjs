import assert from "node:assert/strict";
import test from "node:test";

import { isDashboardEmailAuthorized } from "../src/lib/auth-allowlist.ts";

async function withAllowlist(value, run) {
  const previous = process.env.ORVIUS_AUTH_ALLOWED_EMAILS;
  if (value === undefined) delete process.env.ORVIUS_AUTH_ALLOWED_EMAILS;
  else process.env.ORVIUS_AUTH_ALLOWED_EMAILS = value;

  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.ORVIUS_AUTH_ALLOWED_EMAILS;
    else process.env.ORVIUS_AUTH_ALLOWED_EMAILS = previous;
  }
}

test("an explicitly allowlisted operator can sign in without owning a shop", async () => {
  await withAllowlist(" Operator@Orvius.im ", async () => {
    let ownershipLookups = 0;
    const authorized = await isDashboardEmailAuthorized(
      "operator@orvius.im",
      async () => {
        ownershipLookups += 1;
        return false;
      },
    );

    assert.equal(authorized, true);
    assert.equal(ownershipLookups, 0, "the explicit override should be decisive");
  });
});

test("an active shop owner can sign in when the deployment allowlist is incomplete", async () => {
  await withAllowlist("support@orvius.im", async () => {
    const authorized = await isDashboardEmailAuthorized(
      " MarcoCarlino2006@Gmail.com ",
      async (email) => email === "marcocarlino2006@gmail.com",
    );

    assert.equal(authorized, true);
  });
});

test("an unknown Google account remains denied", async () => {
  await withAllowlist(undefined, async () => {
    assert.equal(
      await isDashboardEmailAuthorized("stranger@example.com", async () => false),
      false,
    );
  });
});

test("missing email and ownership-store failures fail closed", async () => {
  await withAllowlist(undefined, async () => {
    assert.equal(
      await isDashboardEmailAuthorized(null, async () => true),
      false,
    );
    assert.equal(
      await isDashboardEmailAuthorized("owner@example.com", async () => {
        throw new Error("database unavailable");
      }),
      false,
    );
  });
});
