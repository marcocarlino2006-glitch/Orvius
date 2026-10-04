import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDay, formatWhen, paymentMethodLabel, statusWord } from "../src/lib/when.ts";
import { formatCentsTidy } from "../src/lib/money.ts";

const now = new Date("2026-10-01T12:00:00");

test("moments never print seconds, and the year only when it is not this one", () => {
  const when = formatWhen(new Date("2026-09-25T05:53:29"), now);
  assert.equal(when, "Sep 25, 5:53 AM");
  assert.match(formatWhen(new Date("2025-09-25T05:53:29"), now), /2025/);
  assert.equal(formatWhen(null, now), "");
  assert.equal(formatWhen("not a date", now), "");
  assert.equal(formatDay(new Date("2026-09-25T05:53:29"), now), "Sep 25");
});

test("record states read as words", () => {
  assert.equal(statusWord("en_route"), "En route");
  assert.equal(statusWord("same-day"), "Same day");
  assert.equal(statusWord("completed"), "Completed");
  assert.equal(statusWord(null), "");
});

test("payment methods never show a processor id", () => {
  assert.equal(paymentMethodLabel("stripe:cs_live_a1b2c3"), "Paid by card");
  assert.equal(paymentMethodLabel("check"), "Paid by check");
  assert.equal(paymentMethodLabel(null), "Recorded payment");
});

test("real money drops .00 when whole and keeps cents when not", () => {
  assert.equal(formatCentsTidy(221_100), "$2,211");
  assert.equal(formatCentsTidy(4_902), "$49.02");
  assert.equal(formatCentsTidy(null), null);
});
