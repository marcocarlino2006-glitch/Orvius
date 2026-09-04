#!/usr/bin/env node
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProspectCsv } from "../src/lib/prospect-csv.ts";

describe("prospect CSV import", () => {
  it("parses headers and dedupes email", () => {
    const csv = `email,businessName,phone,trade,city
a@shop.com,Alpha HVAC,+15551212,HVAC,Austin
a@shop.com,Dup,+1,HVAC,Austin
bad
b@shop.com,Beta Plumbing,,Plumbing,Dallas
`;
    const r = parseProspectCsv(csv);
    assert.equal(r.rows.length, 2);
    assert.equal(r.rows[0].businessName, "Alpha HVAC");
    assert.equal(r.rows[1].city, "Dallas");
    assert.ok(r.skipped >= 1);
  });

  it("requires email column", () => {
    const r = parseProspectCsv("name,phone\nX,1");
    assert.equal(r.rows.length, 0);
    assert.ok(r.errors[0]?.includes("email"));
  });
});
