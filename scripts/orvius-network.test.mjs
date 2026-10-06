/*
 * The Orvius Network: a shop that can't take a job replies PASS, the caller is
 * asked first, nearby opted-in shops in the trade are offered it, and the first
 * to reply TAKE gets the customer as a new lead.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID"]) {
  delete process.env[key];
}

const { answerNetworkConsent, findNetworkPartners, isNo, isYes, passLeadToNetwork, takeNetworkJob, zip3From } = await import(
  "../src/lib/orvius-network.ts"
);
const { parseOwnerCommand } = await import("../src/lib/owner-text-commands.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const randomPhone = () => `+1555${2_000_000 + Math.floor(Math.random() * 8e6)}`;
const ZIP3 = String(900 + Math.floor(Math.random() * 99));
const created = [];

after(async () => {
  await prisma.business.updateMany({ where: { id: { in: created } }, data: { networkOn: false } });
  // Queued alerts would be drained by later queue tests that count every row.
  await prisma.ownerNotification.deleteMany({ where: { businessId: { in: created } } });
});

function fakeTexts() {
  const customer = [];
  const owner = [];
  return {
    customer,
    owner,
    texts: {
      toCustomer: async (msg) => {
        customer.push(msg);
        return { sent: true };
      },
      toOwner: async (msg) => {
        owner.push(msg);
        return { sid: `SM${owner.length}` };
      },
    },
  };
}

async function shop(overrides = {}) {
  const id = stamp();
  const row = await prisma.business.create({
    data: {
      name: `Shop ${id}`,
      slug: `net-${id}`,
      trade: "HVAC",
      address: `1 Main St, Austin, TX ${ZIP3}01`,
      ownerPhone: randomPhone(),
      ownerEmail: `net-${id}@network.invalid`,
      networkOn: true,
      networkZip3: ZIP3,
      stripeSubscriptionId: `sub_${id}`,
      billingStatus: "active",
      ...overrides,
    },
  });
  created.push(row.id);
  return row;
}

test("owner and caller replies parse", () => {
  assert.deepEqual(parseOwnerCommand("PASS"), { kind: "pass" });
  assert.deepEqual(parseOwnerCommand("can't take it"), { kind: "pass" });
  assert.deepEqual(parseOwnerCommand("Take it"), { kind: "take" });
  assert.deepEqual(parseOwnerCommand("send it"), { kind: "text", body: "it" }, "SEND stays a text command");
  assert.equal(zip3From("1420 Oak St, Austin, TX 78704-1234"), "787");
  assert.equal(zip3From("no zip here"), null);
  assert.ok(isYes("Yes please") && isYes("sí") && !isYes("yesterday was fine"));
  assert.ok(isNo("no thanks") && !isNo("now is good"));
});

test("only paying, opted-in shops in the same trade and region are partners", async () => {
  const sender = await shop();
  const good = await shop();
  await shop({ networkOn: false });
  await shop({ trade: "Plumbing" });
  await shop({ networkZip3: ZIP3 === "999" ? "998" : "999" });
  await shop({ billingStatus: "canceled" });
  await shop({ environment: "demo" });
  const partners = await findNetworkPartners({ trade: "HVAC", zip3: ZIP3, excludeBusinessId: sender.id, limit: 50 });
  const ids = partners.map((p) => p.id);
  assert.ok(ids.includes(good.id));
  assert.ok(!ids.includes(sender.id), "never offered to itself");
  for (const p of partners) {
    const row = await prisma.business.findUnique({ where: { id: p.id } });
    assert.equal(row.trade, "HVAC");
    assert.equal(row.networkOn, true);
    assert.equal(row.billingStatus, "active");
    assert.equal(row.environment, "production");
  }
});

test("PASS asks the caller, YES offers it, the first TAKE wins", async () => {
  await prisma.business.updateMany({ where: { id: { in: created } }, data: { networkOn: false } });
  const sender = await shop();
  const a = await shop();
  const b = await shop();
  const callerPhone = randomPhone();
  const lead = await prisma.lead.create({
    data: {
      businessId: sender.id,
      name: "Dana Ortiz",
      phone: callerPhone,
      address: `1420 Oak St, Austin, TX ${ZIP3}04`,
      serviceType: "AC not cooling",
      urgency: "Urgent",
      notes: "97 inside",
    },
  });
  const t = fakeTexts();

  const passed = await passLeadToNetwork({ ...sender, networkOn: true }, { ...lead, job: null }, t.texts);
  assert.match(passed, /^Asked Dana Ortiz if a nearby Orvius shop can reach out/);
  assert.equal(t.customer.length, 1);
  assert.match(t.customer[0].body, /Reply YES/);
  assert.equal(t.customer[0].businessId, sender.id, "asked from the shop the caller called");
  assert.equal(t.owner.length, 0, "nothing goes to other shops before the caller agrees");
  assert.match(await passLeadToNetwork({ ...sender, networkOn: true }, { ...lead, job: null }, t.texts), /already offered/);

  assert.equal(await answerNetworkConsent({ business: sender, from: callerPhone, body: "what time?" }, t.texts), null);
  const yes = await answerNetworkConsent({ business: sender, from: callerPhone, body: "Yes" }, t.texts);
  assert.match(yes, /nearby pro from the Orvius Network will reach out/);
  const offered = t.owner.map((m) => m.businessId);
  assert.ok(offered.includes(a.id) && offered.includes(b.id));
  assert.ok(t.owner.every((m) => !m.body.includes(callerPhone) && !m.body.includes("Ortiz")), "offers carry no number or last name");

  const won = await takeNetworkJob({ id: a.id, name: a.name }, new Date(), t.texts);
  assert.match(won, /^It's yours: Dana Ortiz/);
  const handoff = await prisma.networkHandoff.findUnique({ where: { leadId: lead.id } });
  assert.equal(handoff.status, "taken");
  assert.equal(handoff.toBusinessId, a.id);
  const newLead = await prisma.lead.findUnique({ where: { id: handoff.toLeadId } });
  assert.equal(newLead.businessId, a.id);
  assert.equal(newLead.phone, callerPhone);
  assert.equal(newLead.source, "network");
  assert.match(newLead.notes, /From the Orvius Network/);
  assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, "lost");
  assert.ok(t.customer.some((m) => m.businessId === a.id && /has your request/.test(m.body)), "caller told who is coming");
  assert.ok(t.owner.some((m) => m.businessId === sender.id && /went to/.test(m.body)), "sender told where it went");
  const alert = await prisma.ownerNotification.findFirst({ where: { businessId: a.id, leadId: newLead.id } });
  assert.ok(alert, "the winner gets a lead alert, so BOOK works on it");

  assert.equal(await takeNetworkJob({ id: b.id, name: b.name }, new Date(), t.texts), "Another shop already took that job.");
  assert.match(await takeNetworkJob({ id: a.id, name: a.name }, new Date(), t.texts), /already yours/);
  const stranger = await shop({ networkZip3: "000" });
  assert.equal(await takeNetworkJob({ id: stranger.id, name: stranger.name }, new Date(), t.texts), null);
});

test("no is respected, and nothing happens without the network on or a partner", async () => {
  const sender = await shop();
  await shop();
  const callerPhone = randomPhone();
  const lead = await prisma.lead.create({
    data: { businessId: sender.id, name: "Sam", phone: callerPhone, postalCode: `${ZIP3}10`, serviceType: "Furnace" },
  });
  const t = fakeTexts();
  assert.match(await passLeadToNetwork({ ...sender, networkOn: false }, { ...lead, job: null }, t.texts), /Turn on the Orvius Network/);
  assert.match(await passLeadToNetwork({ ...sender, networkOn: true }, { ...lead, job: { id: "j" } }, t.texts), /already has a job/);

  await passLeadToNetwork({ ...sender, networkOn: true }, { ...lead, job: null }, t.texts);
  assert.match(await answerNetworkConsent({ business: sender, from: callerPhone, body: "no thanks" }, t.texts), /No problem/);
  assert.equal((await prisma.networkHandoff.findUnique({ where: { leadId: lead.id } })).status, "declined");
  assert.equal(t.owner.length, 0);

  const lonely = await shop({ trade: "Electrical" });
  const lonelyLead = await prisma.lead.create({
    data: { businessId: lonely.id, name: "Lee", phone: randomPhone(), postalCode: `${ZIP3}10` },
  });
  assert.match(await passLeadToNetwork({ ...lonely, networkOn: true }, { ...lonelyLead, job: null }, t.texts), /No other Orvius Electrical shop/);
});

test("the network is wired into owner texts, caller replies and Settings", () => {
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  assert.match(read("src/app/api/webhooks/twilio/sms/route.ts"), /answerNetworkConsent\(\{ business, from, body \}\)/);
  assert.match(read("src/lib/owner-text-commands.ts"), /takeNetworkJob\(shop, now\)/);
  assert.match(read("src/app/api/account/route.ts"), /networkZip3For\(/);
  assert.match(read("src/components/settings-center/sections/business-section.tsx"), /Orvius Network/);
});
