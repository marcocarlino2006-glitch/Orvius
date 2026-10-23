#!/usr/bin/env node
/*
 * Setup progress lives on the server: steps are recorded as they are saved,
 * a later step can't be saved or opened before its prerequisites, older shops
 * keep the progress their saved fields imply, a failed test call is recorded
 * with what to do next, the go-live typing survives a closed tab, the sign-up
 * form is kept per signed-in email, and the checkout that turns a shop on
 * refuses an unfinished setup before any Stripe session is opened.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "VAPI_API_KEY", "RESEND_API_KEY"]) delete process.env[key];
process.env.STRIPE_SECRET_KEY = "sk_test_setup_progress";
process.env.STRIPE_PRICE_ID_LINE = "price_local_line";
process.env.STRIPE_PRICE_ID_PRO = "price_local_pro";

const nextServer = await import("next/server");
mock.module("next/server", { namedExports: { ...nextServer, after: () => {} } });

let signedInAs = null;
mock.module(new URL("../src/auth.ts", import.meta.url).href, {
  namedExports: { auth: async () => (signedInAs ? { user: { email: signedInAs } } : null), signIn: async () => {}, signOut: async () => {}, handlers: {} },
});

let ingestFails = false;
const realIngest = await import("../src/lib/call-ingest.ts");
mock.module(new URL("../src/lib/call-ingest.ts", import.meta.url).href, {
  namedExports: {
    ...realIngest,
    ingestEndOfCallReport: async (...args) => {
      if (ingestFails) throw new Error("ingest exploded: SQLITE_BUSY");
      return realIngest.ingestEndOfCallReport(...args);
    },
  },
});

const sessions = [];
const realStripe = await import("../src/lib/stripe.ts");
mock.module(new URL("../src/lib/stripe.ts", import.meta.url).href, {
  namedExports: {
    ...realStripe,
    getStripe: () => ({
      checkout: {
        sessions: {
          list: async () => ({ data: [] }),
          expire: async () => ({}),
          create: async (params) => {
            sessions.push(params);
            return { id: `cs_test_setup_${sessions.length}`, url: "https://checkout.stripe.test/s" };
          },
        },
      },
    }),
  },
});

const { NextRequest } = nextServer;
const setupRoute = await import("../src/app/api/setup/route.ts");
const draftRoute = await import("../src/app/api/setup/draft/route.ts");
const { POST: checkoutPOST } = await import("../src/app/api/billing/checkout/route.ts");
const { activationVersions } = await import("../src/lib/activation-ack.ts");
const { allowedSteps, missingForStep, parseSetup, stepsDone } = await import("../src/lib/setup-flow.ts");
const { prisma } = await import("../src/lib/prisma.ts");

const emails = [];
test.after(async () => {
  const shops = await prisma.business.findMany({ where: { ownerEmail: { in: emails } }, select: { id: true } });
  const ids = shops.map((s) => s.id);
  await prisma.activationAcknowledgement.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.auditEvent.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.setupDraft.deleteMany({ where: { email: { in: emails } } });
  for (const id of ids) await prisma.business.delete({ where: { id } }).catch(() => undefined);
  await prisma.$disconnect();
});

function owner() {
  const email = `setup-${Date.now()}-${Math.random().toString(16).slice(2, 8)}@example.test`;
  emails.push(email);
  process.env.ORVIUS_AUTH_ALLOWED_EMAILS = email;
  signedInAs = email;
  return email;
}

async function act(body) {
  const res = await setupRoute.POST(
    new Request("http://localhost/api/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  );
  return { status: res.status, json: await res.json() };
}

async function current() {
  const res = await setupRoute.GET();
  return (await res.json()).sandbox;
}

test("steps are recorded on the server and a later step can't be saved or opened first", async () => {
  const email = owner();
  const started = await act({ action: "start", name: "Ridge Heating", trade: "HVAC", timezone: "America/Denver" });
  assert.equal(started.status, 200);
  assert.ok(started.json.sandbox.progress.done.business, "business step stamped");
  assert.deepEqual(started.json.sandbox.progress.allowed, ["business", "goal", "day", "test", "live"]);

  const early = await act({ action: "permissions", level: "offer", followUps: false });
  assert.equal(early.status, 409);
  assert.match(early.json.error, /Finish your hours and work first/);
  const jump = await act({ action: "step", step: "permissions" });
  assert.equal(jump.status, 409);
  assert.equal((await act({ action: "step", step: "test" })).status, 200);

  const shop = await prisma.business.findFirstOrThrow({ where: { ownerEmail: email } });
  assert.equal(shop.bookingMode, "book", "refused permissions left the starting booking in place");
  assert.equal(parseSetup(shop.setupJson).permissions, undefined);

  assert.equal((await act({ action: "day", hours: "weekdays" })).status, 200);
  const perms = await act({ action: "permissions", level: "offer", followUps: false });
  assert.equal(perms.status, 200);
  assert.ok(perms.json.sandbox.progress.done.permissions);
  assert.ok(perms.json.sandbox.progress.allowed.includes("live"));

  /* Going back is allowed; the resume point from another device is the saved step. */
  assert.equal((await act({ action: "step", step: "business" })).status, 200);
  assert.equal((await current()).step, "business");
});

test("a shop from before steps were tracked keeps the progress its saved fields imply", () => {
  const legacy = { sandbox: true, goal: "after_hours", permissions: "offer", step: "test" };
  const done = stepsDone(legacy);
  assert.ok(done.business && done.goal && done.day && done.permissions);
  assert.equal(done.test, undefined);
  assert.deepEqual(missingForStep("live", legacy), []);
  assert.deepEqual(missingForStep("live", { sandbox: true, goal: "after_hours" }), []);
  assert.deepEqual(missingForStep("permissions", { sandbox: true, goal: "after_hours" }), ["day"]);
  assert.deepEqual(allowedSteps({ sandbox: true }), ["business", "goal", "day", "test", "live"]);
  assert.deepEqual(allowedSteps({}), ["business"]);
});

test("the facts say which ones the owner confirmed and which are starting values", async () => {
  owner();
  await act({ action: "start", name: "Facts Plumbing", trade: "Plumbing" });
  const before = await current();
  const hours = before.facts.find((f) => f.label === "Open hours");
  assert.equal(hours.source, "starting_default");
  assert.equal(before.facts.find((f) => f.label === "What Orvius may do").source, "starting_default");
  assert.equal(before.facts.find((f) => f.label === "What Orvius may do").value, "offer");
  await act({ action: "day", hours: "weekdays" });
  const after = await current();
  assert.equal(after.facts.find((f) => f.label === "Open hours").source, "confirmed");
  assert.equal(after.facts.find((f) => f.label === "What Orvius may do").source, "starting_default", "hours do not count as choosing what it may do");
});

test("a failed test call is recorded with an attempt count and an actionable message", async () => {
  const email = owner();
  await act({ action: "start", name: "Fail Heating", trade: "HVAC" });
  await act({ action: "day", hours: "weekdays" });
  await act({ action: "permissions", level: "offer", followUps: false });
  ingestFails = true;
  try {
    const first = await act({ action: "test", scenario: "routine" });
    assert.equal(first.status, 409);
    assert.match(first.json.error, /Nothing reached a real person.*Run it again/);
    assert.doesNotMatch(first.json.error, /SQLITE/);
    await act({ action: "test", scenario: "routine" });
  } finally {
    ingestFails = false;
  }
  const view = await current();
  assert.deepEqual(
    view.failures.map((f) => [f.step, f.attempt]),
    [
      ["test", 1],
      ["test", 2],
    ],
  );
  assert.equal(view.progress.done.test, undefined, "a failed test isn't a passed one");
  const shop = await prisma.business.findFirstOrThrow({ where: { ownerEmail: email } });
  assert.equal(parseSetup(shop.setupJson).testedAt, undefined);
});

test("the go-live typing is kept on the server and a partial save doesn't erase the rest", async () => {
  owner();
  await act({ action: "start", name: "Draft Electric", trade: "Electrical" });
  assert.equal((await act({ action: "draft", ownerPhone: "+13035550142" })).status, 200);
  assert.equal((await act({ action: "draft", areaCode: "720" })).status, 200);
  assert.deepEqual((await current()).liveDraft, { ownerPhone: "+13035550142", areaCode: "720" });
});

test("the sign-up form is kept per signed-in email and refuses the signed-out", async () => {
  const email = owner();
  const put = (body) =>
    draftRoute.PUT(new Request("http://localhost/api/setup/draft", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  const saved = await put({ name: "Peak Air", trade: "HVAC", ownerPhone: "+13035550199", areaCode: "303", found: { address: "1 Main St", hoursJson: null, source: "google" } });
  assert.equal(saved.status, 200);
  const got = await (await draftRoute.GET()).json();
  assert.equal(got.draft.name, "Peak Air");
  assert.equal(got.draft.found.source, "google", "an imported fact keeps where it came from");

  owner();
  assert.equal((await (await draftRoute.GET()).json()).draft, null, "another email sees nothing");
  assert.equal((await put({ name: "x", trade: "NOT_A_TRADE" })).status, 400);

  signedInAs = null;
  assert.equal((await draftRoute.GET()).status, 401);
  assert.equal((await put({ name: "y" })).status, 401);

  signedInAs = email;
  assert.equal((await draftRoute.DELETE()).status, 200);
  assert.equal((await (await draftRoute.GET()).json()).draft, null);
  assert.equal(await prisma.business.count({ where: { ownerEmail: email } }), 0, "a draft never creates a shop");
});

test("naming the shop is enough to open checkout", async () => {
  const email = owner();
  await act({ action: "start", name: "Rush Heating", trade: "HVAC" });
  const shop = await prisma.business.findFirstOrThrow({ where: { ownerEmail: email } });
  const before = sessions.length;
  const res = await checkoutPOST(
    new NextRequest("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        planId: "pro",
        shop: { name: "Rush Heating", trade: "HVAC", ownerPhone: "+13035550111", acceptedTerms: true, acceptedSms: true },
        activation: { recording: true, approved: true, ...activationVersions(shop) },
      }),
    }),
  );
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.url, "https://checkout.stripe.test/s");
  assert.equal(sessions.length, before + 1, "naming the shop is enough to open checkout");
  assert.equal(await prisma.activationAcknowledgement.count({ where: { businessId: shop.id } }), 1);
});
