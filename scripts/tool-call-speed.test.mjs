/*
 * The caller waits on every in-call tool reply. When call-started already made
 * the call row, a tool call reuses it and its shop instead of writing again;
 * a call with no row yet still gets exactly one, even under a burst.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "RESEND_API_KEY", "VAPI_API_KEY", "VAPI_WEBHOOK_SECRET"]) delete process.env[key];

const { POST } = await import("../src/app/api/webhooks/vapi/route.ts");

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

test("a tool call on a call that already has a row reuses it untouched", async () => {
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
    assert.equal(after[0].updatedAt.getTime(), existing.updatedAt.getTime(), "no write on the caller's wait");
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
