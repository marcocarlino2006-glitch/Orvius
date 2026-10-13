#!/usr/bin/env node
/*
 * The founder files the shared sender's toll-free verification from /admin:
 * they type only the EIN, address, name and phone, and Orvius fills every
 * other field the same way each time. A rejected one is corrected in place,
 * and one already in review or approved is never filed twice.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.TWILIO_ACCOUNT_SID = "ACtest";
process.env.TWILIO_AUTH_TOKEN = "tok";
process.env.TWILIO_PHONE_NUMBER = "+18446439170";

const twilio = { verifications: [], posts: [] };
const server = createServer((req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.headers.authorization !== `Basic ${Buffer.from("ACtest:tok").toString("base64")}`) return send(401, {});
  if (req.url.startsWith("/2010-04-01/Accounts/ACtest/IncomingPhoneNumbers.json")) return send(200, { incoming_phone_numbers: [{ sid: "PNtoll" }] });
  if (req.method === "GET" && req.url.startsWith("/v1/Tollfree/Verifications")) return send(200, { verifications: twilio.verifications });
  if (req.method === "POST" && req.url.startsWith("/v1/Tollfree/Verifications")) {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      twilio.posts.push({ url: req.url, form: new URLSearchParams(raw) });
      send(201, { sid: "HHnew", status: "PENDING_REVIEW" });
    });
    return;
  }
  send(404, {});
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
process.env.TWILIO_API_BASE = `http://127.0.0.1:${server.address().port}`;

const { submitTollFreeVerification, tollFreeFactsProblem } = await import("../src/lib/toll-free-submit.ts");
const { getLaunchGate } = await import("../src/lib/launch-gate.ts");

const facts = { ein: "12-3456789", street: "100 Main St", city: "Austin", state: "tx", postalCode: "78701", firstName: "Marco", lastName: "C", phone: "(512) 555-0101" };

test("only the owner's facts are typed; everything else is filed the same way every time", async () => {
  twilio.verifications = [];
  twilio.posts = [];
  const result = await submitTollFreeVerification(facts);
  assert.deepEqual(result, { ok: true, status: "PENDING_REVIEW", updated: false });
  const { url, form } = twilio.posts[0];
  assert.equal(url, "/v1/Tollfree/Verifications");
  assert.equal(form.get("TollfreePhoneNumberSid"), "PNtoll");
  assert.equal(form.get("BusinessName"), "Solution Development LLC");
  assert.equal(form.get("DoingBusinessAs"), "Orvius");
  assert.equal(form.get("BusinessRegistrationNumber"), "12-3456789");
  assert.equal(form.get("BusinessStateProvinceRegion"), "TX");
  assert.equal(form.get("BusinessContactPhone"), "+15125550101");
  assert.equal(form.get("NotificationEmail"), "support@orvius.im");
  assert.deepEqual(form.getAll("UseCaseCategories"), ["ACCOUNT_NOTIFICATIONS", "CUSTOMER_CARE"]);
  assert.deepEqual(form.getAll("OptInImageUrls"), ["https://orvius.im/sms-terms"]);
  assert.match(form.get("ProductionMessageSample"), /Reply STOP to opt out/);
  assert.match(form.get("UseCaseSummary"), /never marketing/);
  assert.match(form.get("HelpMessageSample"), /support@orvius\.im/);
});

test("a rejected verification is corrected in place, and one in review is never filed twice", async () => {
  twilio.posts = [];
  twilio.verifications = [{ sid: "HHold", status: "TWILIO_REJECTED", date_created: "2026-10-01" }];
  const fixed = await submitTollFreeVerification(facts);
  assert.equal(fixed.ok && fixed.updated, true);
  assert.equal(twilio.posts[0].url, "/v1/Tollfree/Verifications/HHold");

  twilio.posts = [];
  twilio.verifications = [{ sid: "HHold", status: "IN_REVIEW", date_created: "2026-10-02" }];
  const again = await submitTollFreeVerification(facts);
  assert.equal(again.ok, false);
  assert.match(again.error, /already in review/);
  assert.equal(twilio.posts.length, 0);
});

test("typed facts are checked before anything is sent", () => {
  assert.match(tollFreeFactsProblem({ ...facts, ein: "123" }), /9 digits/);
  assert.match(tollFreeFactsProblem({ ...facts, state: "Texas" }), /two-letter/);
  assert.match(tollFreeFactsProblem({ ...facts, postalCode: "7870" }), /ZIP/);
  assert.match(tollFreeFactsProblem({ ...facts, phone: "555" }), /10-digit/);
  assert.equal(tollFreeFactsProblem(facts), null);
});

test("the launch card offers the form until it's submitted, then just shows the status", async () => {
  twilio.verifications = [];
  let item = (await getLaunchGate()).items.find((i) => i.key === "textDelivery");
  assert.equal(item.canSubmit, true);
  twilio.verifications = [{ sid: "HH1", status: "PENDING_REVIEW", date_created: "2026-10-03" }];
  item = (await getLaunchGate()).items.find((i) => i.key === "textDelivery");
  assert.ok(!item.canSubmit);
  const admin = readFileSync(new URL("../src/app/admin/page.tsx", import.meta.url), "utf8");
  assert.match(admin, /item\.canSubmit \? <TollFreeForm \/>/);
  const route = readFileSync(new URL("../src/app/api/admin/toll-free/route.ts", import.meta.url), "utf8");
  assert.match(route, /isPrivilegedRequest/);
});

test.after(() => server.close());
