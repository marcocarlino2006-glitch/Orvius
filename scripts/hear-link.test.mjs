#!/usr/bin/env node
/*
 * One personal link per prospect: it opens on their own business already
 * filled in, reads naturally in a text, and the page can use the microphone.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hearLink, matchTrade, spokenBusinessName } from "../src/lib/hear-link.ts";
import { fillOutreachTemplate, outreachTemplates } from "../src/lib/outreach-templates.ts";
import { outreachRows } from "./outreach-links.mjs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("a prospect's link carries their business, trade and city", () => {
  const url = new URL(hearLink({ business: "Cool Breeze HVAC, LLC", trade: "Heating & Air", city: "Phoenix", ref: "b1" }));
  assert.equal(url.pathname, "/h");
  assert.equal(url.searchParams.get("b"), "Cool Breeze HVAC");
  assert.equal(url.searchParams.get("t"), "HVAC");
  assert.equal(url.searchParams.get("c"), "Phoenix");
  assert.equal(url.searchParams.get("r"), "b1");
  assert.equal(matchTrade("plumbing"), "Plumbing");
  assert.equal(matchTrade("Electrician"), "Electrical");
  assert.equal(matchTrade("basket weaving"), null);
  assert.equal(spokenBusinessName("Ruiz Plumbing Inc."), "Ruiz Plumbing");
});

test("the outreach text uses the personal link and makes no promise we can't keep", () => {
  for (const t of outreachTemplates) assert.doesNotMatch(t.body, /guarantee|never miss|100%|orvius\.im\/demo/i, t.id);
  const msg = fillOutreachTemplate(outreachTemplates.find((t) => t.id === "cold_dm").body, { name: "Maria", business: "Ruiz Plumbing", link: "https://orvius.im/h?b=Ruiz" });
  assert.match(msg, /^Hi Maria/);
  assert.match(msg, /https:\/\/orvius\.im\/h\?b=Ruiz$/);
  assert.doesNotMatch(msg, /\[[A-Z][a-z]+\]/, "no placeholder left in");
});

test("a prospect list becomes one ready message per shop", () => {
  const rows = outreachRows('business,trade,city,owner\n"Ruiz Plumbing & Drain, LLC",plumbing,Tucson,Maria Ruiz\n,HVAC,Mesa,\n', "x");
  assert.equal(rows.length, 1, "rows without a business are skipped");
  assert.match(rows[0].message, /^Hi Maria, I set up a demo of Ruiz Plumbing & Drain's phone/);
  assert.equal(new URL(rows[0].link).searchParams.get("b"), "Ruiz Plumbing & Drain");
});

test("the personal page opens with the business filled in and can use the microphone", () => {
  const page = read("src/app/h/page.tsx");
  assert.match(page, /TalkInBrowser personal initial=\{\{ name, trade, city \}\}/);
  assert.match(page, /isHipaaTrade/);
  assert.match(read("next.config.ts"), /"\/\(try\|launch\|h\)"/);
  assert.match(read("src/app/admin/page.tsx"), /hearLink\(/);
});
