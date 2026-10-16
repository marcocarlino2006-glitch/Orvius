/*
 * The caller waits on every in-call tool reply. When call-started already made
 * the call row, a tool call reuses it and its shop instead of writing again;
 * a call with no row yet still gets exactly one, even under a burst.
 *
 * Bounded-write rule: on a call that already has a row, an availability reply
 * makes at most one database write (two when it offers the network), and only
 * to that call's offer fields by id: the offered times are the evidence a
 * hold is checked against. A slow write costs the caller one write's time, and
 * a failed write gives the safe "don't offer a time" answer, never an error.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "RESEND_API_KEY", "VAPI_API_KEY", "VAPI_WEBHOOK_SECRET"]) delete process.env[key];

const { POST } = await import("../src/app/api/webhooks/vapi/route.ts");
const { prisma: app } = await import("../src/lib/prisma.ts");
const { Prisma } = await import("@prisma/client");

const WRITE_METHODS = ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"];
/** Wrap every write on the app's client; returns the log and an undo. */
function watchWrites(hook = async () => {}) {
  const log = [];
  const undo = [];
  for (const model of Object.values(Prisma.ModelName)) {
    const delegate = app[model[0].toLowerCase() + model.slice(1)];
    for (const method of WRITE_METHODS) {
      const original = delegate?.[method];
      if (typeof original !== "function") continue;
      delegate[method] = async (args) => {
        log.push({ model, method, where: args?.where, fields: Object.keys(args?.data ?? {}) });
        await hook(model, method);
        return original.call(delegate, args);
      };
      undo.push(() => (delegate[method] = original));
    }
  }
  const tx = app.$transaction;
  app.$transaction = async (...args) => {
    log.push({ model: "$transaction" });
    return tx.apply(app, args);
  };
  undo.push(() => (app.$transaction = tx));
  return { log, restore: () => undo.forEach((u) => u()) };
}

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const toolCall = (vapiCallId, line) =>
  POST(
    new Request("https://app.test/api/webhooks/vapi", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          type: "tool-calls",
          call: { id: vapiCallId, phoneNumber: { number: line }, customer: { number: "+13125557788" } },
          toolCallList: [{ id: "tc_1", function: { name: "check_availability", arguments: { preference: "tomorrow morning" } } }],
        },
      }),
    }),
  );

async function withShop(fn) {
  const line = `+1312555${String(Math.floor(Math.random() * 10_000)).padStart(4, "0")}`;
  const shop = await prisma.business.create({
    data: { name: "Speedy Air", slug: `speedy-${stamp()}`, vapiPhoneNumber: line, billingStatus: "active" },
  });
  try {
    await fn(shop, line);
  } finally {
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
}

test("a tool call on a call with no row yet creates exactly one, even when replies race", async () => {
  await withShop(async (shop, line) => {
    const vapiCallId = `speed-new-${stamp()}`;
    const replies = await Promise.all([toolCall(vapiCallId, line), toolCall(vapiCallId, line), toolCall(vapiCallId, line)]);
    for (const reply of replies) {
      assert.equal(reply.status, 200);
      const { results } = await reply.json();
      assert.equal(results[0].toolCallId, "tc_1");
      assert.match(results[0].result, /Open times|Nothing is open/);
    }
    const rows = await prisma.call.findMany({ where: { vapiCallId } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].businessId, shop.id);
    assert.equal(rows[0].status, "in-progress");
  });
});

test("a tool call on a call that already has a row reuses it, writing only what it offered", async () => {
  await withShop(async (shop, line) => {
    const vapiCallId = `speed-old-${stamp()}`;
    const existing = await prisma.call.create({
      data: { businessId: shop.id, vapiCallId, callerPhone: "+13125557788", status: "in-progress" },
    });
    const reply = await toolCall(vapiCallId, line);
    const { results } = await reply.json();
    assert.match(results[0].result, /Open times|Nothing is open/);
    const after = await prisma.call.findMany({ where: { vapiCallId } });
    assert.equal(after.length, 1);
    assert.equal(after[0].id, existing.id);
    for (const field of ["businessId", "callerPhone", "status", "createdAt"]) {
      assert.deepEqual(after[0][field], existing[field], `${field} is untouched on the caller's wait`);
    }
    // The one write is the offer itself, by primary key: a hold is only accepted for a time this call was offered.
    assert.ok(after[0].slotOfferJson || /Nothing is open/.test(results[0].result), "the offered times are on the call");
  });
});

async function existingCall(shop) {
  const vapiCallId = `speed-w-${stamp()}`;
  const row = await prisma.call.create({ data: { businessId: shop.id, vapiCallId, callerPhone: "+13125557788", status: "in-progress" } });
  return { vapiCallId, row };
}

test("bounded writes: one write on the caller's wait, to this call's offer fields, by id", async () => {
  await withShop(async (shop, line) => {
    const { vapiCallId, row } = await existingCall(shop);
    const watch = watchWrites();
    let reply;
    try {
      reply = await toolCall(vapiCallId, line);
    } finally {
      watch.restore();
    }
    assert.equal(reply.status, 200);
    const nonAudit = watch.log.filter((w) => w.model !== "AuditEvent");
    const { results } = await reply.json();
    assert.match(results[0].result, /Open times/, "this shop has times to offer");
    assert.equal(nonAudit.length, 1, `one write when times are offered, saw ${JSON.stringify(nonAudit)}`);
    for (const w of nonAudit) {
      assert.equal(w.model, "Call");
      assert.equal(w.method, "updateMany", "no upsert, no create");
      assert.deepEqual(w.where, { id: row.id }, "by primary key");
      assert.deepEqual(w.fields.sort(), ["networkOfferJson", "slotOfferJson"]);
    }
    assert.equal(watch.log.filter((w) => w.model === "$transaction").length, 0);
  });
});

test("latency: a slow offer write costs the caller about one write, not one per step", async () => {
  await withShop(async (shop, line) => {
    const { vapiCallId } = await existingCall(shop);
    await toolCall(vapiCallId, line); // warm caches and the first-call code path
    const t0 = performance.now();
    await toolCall(vapiCallId, line);
    const base = performance.now() - t0;
    const DELAY = 200;
    const watch = watchWrites(async (model) => {
      if (model === "Call") await new Promise((r) => setTimeout(r, DELAY));
    });
    let slow;
    try {
      const t1 = performance.now();
      const reply = await toolCall(vapiCallId, line);
      slow = performance.now() - t1;
      assert.equal(reply.status, 200);
    } finally {
      watch.restore();
    }
    const delayed = watch.log.filter((w) => w.model === "Call").length;
    assert.ok(slow - base < DELAY * delayed + 250, `reply ${Math.round(slow)}ms vs ${Math.round(base)}ms base with ${delayed} delayed write(s)`);
    assert.ok(base < 1500, `the undelayed reply stays fast (${Math.round(base)}ms)`);
  });
});

test("failure: the offer write fails and the caller hears the safe answer, not an error", async () => {
  await withShop(async (shop, line) => {
    const { vapiCallId } = await existingCall(shop);
    const watch = watchWrites(async (model) => {
      if (model === "Call") throw new Error("database is locked");
    });
    let reply;
    try {
      reply = await toolCall(vapiCallId, line);
    } finally {
      watch.restore();
    }
    assert.equal(reply.status, 200);
    const { results } = await reply.json();
    assert.equal(results[0].toolCallId, "tc_1");
    assert.doesNotMatch(results[0].result, /Open times/, "no time is offered without the evidence a hold needs");
    assert.match(results[0].result, /Do not offer a time/);
  });
});

test("the tool path does no upsert transaction and the lookups run together", () => {
  const route = readFileSync(new URL("../src/app/api/webhooks/vapi/route.ts", import.meta.url), "utf8");
  const toolBranch = route.slice(route.indexOf('if (type === "tool-calls")'), route.indexOf("const webCall"));
  assert.doesNotMatch(toolBranch, /\.upsert\(/);
  assert.match(toolBranch, /existingCall\?\.business/);
  assert.match(route, /Promise\.all\(\[\s*findPreviewByVapiCallId\(vapiCallId\),\s*findCallWithBusiness\(vapiCallId\)/);
  assert.match(route, /Promise\.all\(\[\s*claimPreviewCall\(/);
});
