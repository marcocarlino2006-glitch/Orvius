import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";

import {
  LINK_TTL_MINUTES,
  buildMagicLinkEmail,
  buildMagicLinkUrl,
  consumeMagicLink,
  issueMagicLink,
  normalizeEmail,
} from "../src/lib/magic-link.ts";
import { prisma } from "../src/lib/prisma.ts";

const EMAIL = "owner@magic-link-test.invalid";

async function clear() {
  await prisma.loginToken.deleteMany({ where: { email: { contains: "magic-link-test" } } });
}

beforeEach(clear);
after(async () => {
  await clear();
  await prisma.$disconnect();
});

test("a fresh link signs in once and is dead on replay", async () => {
  const issued = await issueMagicLink(EMAIL);
  assert.equal(issued.ok, true);

  assert.equal(await consumeMagicLink(issued.token), EMAIL);
  assert.equal(
    await consumeMagicLink(issued.token),
    null,
    "a single-use token must not authenticate twice",
  );
});

test("only the hash is stored, so the table is not a list of logins", async () => {
  const issued = await issueMagicLink(EMAIL);
  assert.equal(issued.ok, true);

  const rows = await prisma.loginToken.findMany({ where: { email: EMAIL } });
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].tokenHash, issued.token);
  assert.match(rows[0].tokenHash, /^[0-9a-f]{64}$/);
});

test("an expired link is refused", async () => {
  const issued = await issueMagicLink(EMAIL);
  assert.equal(issued.ok, true);

  await prisma.loginToken.updateMany({
    where: { email: EMAIL },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });

  assert.equal(await consumeMagicLink(issued.token), null);
});

test("unknown and malformed tokens are refused without throwing", async () => {
  assert.equal(await consumeMagicLink(""), null);
  assert.equal(await consumeMagicLink("not-a-real-token"), null);
  assert.equal(await consumeMagicLink("x".repeat(600)), null);
});

test("addresses that cannot be emailed never mint a token", async () => {
  for (const bad of ["", "   ", "nope", "no@domain", "a@b.c d", `${"a".repeat(250)}@x.io`]) {
    const result = await issueMagicLink(bad);
    assert.equal(result.ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
    assert.equal(result.reason, "invalid-email");
  }
  assert.equal(await prisma.loginToken.count({ where: { email: { contains: "magic-link-test" } } }), 0);
});

test("a burst of requests for one address is rate limited", async () => {
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await issueMagicLink(EMAIL)).ok, true, `request ${i + 1} should succeed`);
  }
  const fourth = await issueMagicLink(EMAIL);
  assert.equal(fourth.ok, false);
  assert.equal(fourth.reason, "rate-limited");
});

test("the allowlist is enforced at issue and again at redemption", async () => {
  const previous = process.env.ORVIUS_AUTH_ALLOWED_EMAILS;
  try {
    process.env.ORVIUS_AUTH_ALLOWED_EMAILS = EMAIL;
    const allowed = await issueMagicLink(EMAIL);
    assert.equal(allowed.ok, true);

    const blocked = await issueMagicLink("stranger@magic-link-test.invalid");
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, "not-allowed");

    // Access revoked while the link was in flight: the link must stop working.
    process.env.ORVIUS_AUTH_ALLOWED_EMAILS = "someone-else@magic-link-test.invalid";
    assert.equal(await consumeMagicLink(allowed.token), null);
  } finally {
    if (previous === undefined) delete process.env.ORVIUS_AUTH_ALLOWED_EMAILS;
    else process.env.ORVIUS_AUTH_ALLOWED_EMAILS = previous;
  }
});

test("addresses are normalized so casing cannot fork an account", async () => {
  assert.equal(normalizeEmail("  Owner@Shop.COM "), "owner@shop.com");

  const issued = await issueMagicLink("OWNER@magic-link-test.invalid");
  assert.equal(issued.ok, true);
  assert.equal(await consumeMagicLink(issued.token), "owner@magic-link-test.invalid");
});

test("the emailed link points at the verify route and states its own limits", () => {
  const url = new URL(buildMagicLinkUrl("token-value"));
  assert.equal(url.pathname, "/signin/verify");
  assert.equal(url.searchParams.get("token"), "token-value");

  const message = buildMagicLinkEmail(url.toString());
  assert.match(message.subject, /sign-in link/i);
  assert.match(message.text, new RegExp(`${LINK_TTL_MINUTES} minutes`));
  assert.ok(message.text.includes(url.toString()));
});
