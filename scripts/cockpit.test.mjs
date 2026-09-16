#!/usr/bin/env node
/**
 * Cockpit guards.
 *
 * 1. Command palette search can never leave one shop's records.
 * 2. The command board caps any one customer, so a noisy day for one caller
 *    cannot push another caller's emergency off the first screen.
 *
 * Both modules are imported directly — no mirrored copies of the logic, so
 * these tests fail if the real code drifts.
 */
import assert from "node:assert/strict";
import { buildSearchFilters, MIN_QUERY_LENGTH } from "../src/lib/search-query.ts";
import {
  MAX_ROWS_PER_PERSON,
  rollUpByPerson,
} from "../src/lib/attention-rollup.ts";

/* ── Search is always scoped to one shop ────────────────────────────────── */

const SHOP = "biz_alpha";
const filters = buildSearchFilters(SHOP, "maria");
assert.ok(filters, "a two-character query must build filters");

for (const [model, where] of Object.entries(filters)) {
  assert.equal(
    where.businessId,
    SHOP,
    `${model} filter must be pinned to the caller's shop`,
  );
  // The OR block is where operator input lands. It must only widen matching
  // inside the shop — never introduce a businessId of its own.
  const json = JSON.stringify(where.OR);
  assert.ok(
    !json.includes("businessId"),
    `${model} OR block must not touch businessId`,
  );
  assert.ok(where.OR.length > 0, `${model} filter must match something`);
}

// Operator input that looks like a Prisma filter is still just a string.
const injected = buildSearchFilters(SHOP, '{"businessId":"biz_beta"}');
assert.equal(injected.lead.businessId, SHOP);
assert.equal(injected.customer.businessId, SHOP);
assert.equal(injected.job.businessId, SHOP);
assert.equal(
  injected.lead.OR[0].name.contains,
  '{"businessId":"biz_beta"}',
  "a filter-shaped query is matched as literal text",
);

// Short and empty queries never reach the database.
assert.equal(buildSearchFilters(SHOP, ""), null);
assert.equal(buildSearchFilters(SHOP, "a"), null);
assert.equal(buildSearchFilters(SHOP, "  a  "), null);
assert.equal(MIN_QUERY_LENGTH, 2);

// No shop, no search.
assert.equal(buildSearchFilters("", "maria"), null);

// Digits become a phone match only once there are enough of them.
const phoney = buildSearchFilters(SHOP, "555-0100");
assert.ok(
  phoney.lead.OR.some((clause) => clause.phone?.contains === "5550100"),
  "a dialed query searches phone numbers by digits",
);
assert.ok(
  !buildSearchFilters(SHOP, "ac1").lead.OR.some((clause) => clause.phone),
  "one stray digit is not a phone number",
);

/* ── One customer cannot flood the board ────────────────────────────────── */

const person = (key, label, n, kind = "needs_customer_confirm") => ({
  id: `${key}:${n}`,
  kind,
  group: { key, label, href: `/dashboard/customers/${key}` },
});

// Maria has four confirms and one unassigned job; Priya has three confirms.
const flooded = [
  person("cust_maria", "Maria Lopez", 1),
  person("cust_maria", "Maria Lopez", 2),
  person("cust_maria", "Maria Lopez", 3),
  person("cust_maria", "Maria Lopez", 4),
  person("cust_maria", "Maria Lopez", 5, "unassigned_job"),
  { id: "shop:proof" }, // shop-level row, no person
  person("cust_priya", "Priya Patel", 1),
  person("cust_priya", "Priya Patel", 2),
  person("cust_priya", "Priya Patel", 3),
];

const board = rollUpByPerson(flooded);

assert.equal(MAX_ROWS_PER_PERSON, 2);
assert.deepEqual(
  board.map((row) => row.id),
  ["cust_maria:1", "cust_maria:5", "shop:proof", "cust_priya:1"],
  "one row per person per kind, most urgent first, shop rows untouched",
);
assert.equal(
  board.filter((row) => row.group?.key === "cust_maria").length,
  2,
  "Maria keeps her confirm and her unassigned job — not four identical confirms",
);
// Exactly one roll-up line per person, under the last row of theirs.
assert.equal(board[0].rolledUp, undefined, "no roll-up line on her first row");
assert.equal(board[1].rolledUp, 3, "her last row carries all three folded rows");
assert.equal(board[3].rolledUp, 2, "Priya's one row counts her two repeats");
assert.equal(board[2].rolledUp, undefined, "shop-level rows are never folded");
assert.equal(
  board.filter((row) => row.rolledUp).length,
  2,
  "two flooded people, two roll-up lines",
);

// Asking twice for the same action on the same person is what read like a bug.
const sameKind = rollUpByPerson([
  person("cust_ana", "Ana Diaz", 1),
  person("cust_ana", "Ana Diaz", 2),
]);
assert.equal(sameKind.length, 1, "a repeated ask collapses to one row");
assert.equal(sameKind[0].rolledUp, 1);

// A different caller's emergency stays on the board even after a flood.
const withEmergency = rollUpByPerson([
  ...flooded,
  person("cust_dee", "Dee Wilson", 1),
]);
assert.ok(
  withEmergency.some((row) => row.id === "cust_dee:1"),
  "a third caller is still visible after two floods",
);

// Nothing to fold: the list comes back untouched.
const quiet = [person("cust_a", "A", 1), person("cust_b", "B", 1)];
assert.deepEqual(rollUpByPerson(quiet), quiet);
assert.deepEqual(rollUpByPerson([]), []);

// The input array is not mutated — callers keep their ranked list.
const original = [
  person("cust_x", "X", 1),
  person("cust_x", "X", 2, "unassigned_job"),
  person("cust_x", "X", 3, "overdue_followup"),
];
const snapshot = JSON.stringify(original);
rollUpByPerson(original);
assert.equal(JSON.stringify(original), snapshot, "roll-up does not mutate its input");

console.log("cockpit: search scoping + board roll-up ok");
