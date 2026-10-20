#!/usr/bin/env node
/*
 * Bulletproofing found by being the shop (scripts/shop-sim.mjs, 13 checks
 * through the real webhooks): a texted address was never read, an address
 * without a ZIP read as out-of-area, vendor pitches matched no sales
 * pattern, and the spam silencer thought every caller was a returning
 * customer because the call-start handler had just created their row.
 * These tests keep each of those from quietly coming back.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { extractStreetAddress } from "../src/lib/street-address.ts";
import { isInServiceArea } from "../src/lib/service-area.ts";
import { looksLikeSalesSolicitation } from "../src/lib/job-taxonomy.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("a texted address is read the way customers actually write it", () => {
  assert.equal(extractStreetAddress("Hi, my furnace won't ignite. 915 Hinman Ave, Evanston. Can someone come today?"), "915 Hinman Ave, Evanston");
  assert.equal(extractStreetAddress("AC is out — 418 Elm St, Evanston IL 60201"), "418 Elm St, Evanston, IL 60201");
  assert.equal(extractStreetAddress("water everywhere at 77 Main Street, Austin, TX 78701!!"), "77 Main Street, Austin, TX 78701");
  assert.equal(extractStreetAddress("call me after 5 about the quote"), null);
  assert.equal(extractStreetAddress("apt 4, no heat since Tuesday"), null);
  const route = read("src/app/api/webhooks/twilio/sms/route.ts");
  assert.match(route, /address: extractStreetAddress\(body\)/, "the SMS lead is created with the address it was handed");
});

test("an address without a ZIP is unknown territory, not outside it", () => {
  const zips = JSON.stringify(["60201", "60202"]);
  assert.equal(isInServiceArea("915 Hinman Ave, Evanston", zips), null, "no ZIP: the shop decides, the job is not auto-held");
  assert.equal(isInServiceArea("915 Hinman Ave, Evanston IL 60201", zips), true);
  assert.equal(isInServiceArea("1 Congress Ave, Austin TX 78701", zips), false, "a known foreign ZIP is still out");
});

test("vendor pitches match sales patterns; homeowners asking about warranties do not", () => {
  assert.equal(looksLikeSalesSolicitation("We sell extended warranty plans to HVAC shops. Who handles purchasing there?"), true);
  assert.equal(looksLikeSalesSolicitation("Sales pitch — selling supplies to shops in your area"), true);
  assert.equal(looksLikeSalesSolicitation("Do you honor extended warranty plans? Mine covers the furnace."), false);
  assert.equal(looksLikeSalesSolicitation("My warranty plan says you are the approved shop"), false);
});

test("a caller is only 'returning' when their record predates the call", () => {
  const ingest = read("src/lib/call-ingest.ts");
  assert.match(ingest, /link\.customer\.createdAt\.getTime\(\) < call\.createdAt\.getTime\(\)/, "the silencer compares timestamps, not existence");
  assert.match(ingest, /const returningCustomer = Boolean\(/, "the fix is named for the next reader");
  assert.doesNotMatch(ingest, /looksLikeWork = Boolean\(freshLead\.address\?\.trim\(\) \|\| \(link && !link\.created\)\)/, "the defeated check is gone");
});

test("the shop simulation itself stays in the repo and asserts by design, not by hope", () => {
  const sim = read("scripts/shop-sim.mjs");
  for (const promise of ["auto-books a job", "NOT auto-booked", "alerts the owner", "does not become a job", "kept for callback", "does not page the owner", "auto-books", "Work queue shows", "Ask answers"]) {
    assert.ok(sim.includes(promise), `shop-sim asserts: ${promise}`);
  }
});
