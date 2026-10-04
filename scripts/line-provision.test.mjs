/*
 * The line is bought after the shop has paid, so a sold-out area code must
 * never fail setup. A fake Twilio client stands in for inventory.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  areaCodeFromPhone,
  parseAreaCode,
  purchaseLocalNumber,
} from "../src/lib/twilio-phone.ts";

function fakeTwilio({ inventory = {}, anywhere = ["+13035550100"], taken = [] } = {}) {
  const bought = [];
  const searches = [];
  return {
    bought,
    searches,
    availablePhoneNumbers: () => ({
      local: {
        list: async ({ areaCode }) => {
          searches.push(areaCode ?? "any");
          const pool = areaCode ? inventory[areaCode] ?? [] : anywhere;
          return pool.map((phoneNumber) => ({ phoneNumber }));
        },
      },
    }),
    incomingPhoneNumbers: {
      create: async ({ phoneNumber }) => {
        if (taken.includes(phoneNumber)) throw new Error("number no longer available");
        bought.push(phoneNumber);
        return { phoneNumber };
      },
    },
  };
}

test("area codes parse only valid North American codes", () => {
  assert.equal(parseAreaCode("512"), 512);
  assert.equal(parseAreaCode("112"), null);
  assert.equal(parseAreaCode("51"), null);
  assert.equal(areaCodeFromPhone("+1 (512) 555-0123"), 512);
  assert.equal(areaCodeFromPhone("555"), undefined);
});

test("the exact number the owner picked is bought", async () => {
  const client = fakeTwilio();
  const line = await purchaseLocalNumber({ areaCode: 512, phoneNumber: "+15125550111" }, client);
  assert.deepEqual(line, { phoneNumber: "+15125550111", areaCodeMatched: true });
});

test("a pick taken in the meantime falls back to the same area code", async () => {
  const client = fakeTwilio({
    inventory: { 512: ["+15125550112"] },
    taken: ["+15125550111"],
  });
  const line = await purchaseLocalNumber({ areaCode: 512, phoneNumber: "+15125550111" }, client);
  assert.deepEqual(line, { phoneNumber: "+15125550112", areaCodeMatched: true });
});

test("a sold-out area code tries the owner's mobile area code, then anywhere", async () => {
  const mobile = fakeTwilio({ inventory: { 737: ["+17375550100"] } });
  const viaMobile = await purchaseLocalNumber(
    { areaCode: 512, ownerPhone: "+17375550199" },
    mobile,
  );
  assert.deepEqual(viaMobile, { phoneNumber: "+17375550100", areaCodeMatched: false });

  const none = fakeTwilio();
  const anywhere = await purchaseLocalNumber({ areaCode: 512, ownerPhone: "+15125550199" }, none);
  assert.deepEqual(anywhere, { phoneNumber: "+13035550100", areaCodeMatched: false });
  assert.deepEqual(none.searches, [512, "any"], "the same area code is not searched twice");
});

test("no inventory anywhere is a clear error, not a partial purchase", async () => {
  const client = fakeTwilio({ anywhere: [] });
  await assert.rejects(
    purchaseLocalNumber({ areaCode: 512 }, client),
    /No local phone numbers available/,
  );
  assert.equal(client.bought.length, 0);
});
