/*
 * A shop whose alerts reach nobody is escalated to the founder by email as
 * well as text: when Twilio is what broke, the founder's text fails too.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

delete process.env.ORVIUS_FOUNDER_PHONE;
delete process.env.RESEND_FROM;
process.env.RESEND_API_KEY = "re_test";
process.env.ORVIUS_FOUNDER_EMAILS = "founder@orvius.test";

const { pageOwnerUnreachable } = await import("../src/lib/platform-pager.ts");
const prisma = new PrismaClient();

test("with no founder phone, the unreachable-owner page still arrives by email, once a day", async (t) => {
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("api.resend.com")) {
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: `em_${sent.length}` }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return realFetch(url, init);
  };
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  const shop = await prisma.business.create({
    data: { name: "Landline Heating", slug: `unreach-${Date.now()}`, ownerPhone: "+13035550188", ownerEmail: "owner@landline.test" },
  });
  try {
    const page = await pageOwnerUnreachable(shop.id, "email");
    assert.equal(page.paged, true);
    assert.equal(page.sms, false);
    assert.equal(page.email, 1);
    assert.equal(sent.length, 1);
    assert.deepEqual([sent[0].to].flat(), ["founder@orvius.test"]);
    assert.match(sent[0].subject, /Landline Heating isn't getting alerts/);
    assert.match(sent[0].text, /text and email both failed\). Call them: \+13035550188/);
    assert.equal((await pageOwnerUnreachable(shop.id, "email")).paged, false);
    assert.equal(sent.length, 1);
  } finally {
    await prisma.business.delete({ where: { id: shop.id } });
  }
});
