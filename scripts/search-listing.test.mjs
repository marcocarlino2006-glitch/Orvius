/*
 * What someone sees when they search for Orvius: the title, the caption and
 * the structured data. The caption is the first thing most people ever read
 * about us, so it has to fit, say what we do for any business, and make no
 * promise the product can't keep.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { company } from "../src/lib/company.ts";
import { pricingPlans } from "../src/lib/pricing-plans.ts";
import { buildSiteStructuredData } from "../src/lib/structured-data.ts";

const ABSOLUTIST = /never miss|answers every call|every call answered|guarantee|100%/i;

test("the search title and caption fit and say what we do", () => {
  assert.ok(company.searchTitle.length <= 60, `title is ${company.searchTitle.length} chars`);
  assert.match(company.searchTitle, /^Orvius/);
  assert.match(company.searchTitle, /AI Receptionist/i);
  assert.ok(company.searchDescription.length <= 155, `caption is ${company.searchDescription.length} chars`);
  assert.ok(company.searchDescription.length >= 110, "caption uses the space it has");
  assert.match(company.searchTitle, /HVAC/, "the listing names the trades we launch for");
  assert.match(company.searchTitle, /Plumbing/);
  assert.match(company.searchTitle, /Electrical/);
  for (const text of [company.searchTitle, company.searchDescription]) assert.doesNotMatch(text, ABSOLUTIST);
});

test("structured data names the site and prices it from the real plans", () => {
  const [site, org, app] = buildSiteStructuredData();
  assert.equal(site["@type"], "WebSite");
  assert.equal(site.name, "Orvius");
  assert.equal(org["@type"], "Organization");
  assert.equal(org.url, "https://orvius.im");
  assert.match(org.logo, /\/apple-icon$/);
  const paid = pricingPlans.filter((p) => !p.contactSales && p.price > 0).map((p) => p.price);
  assert.equal(app.offers.lowPrice, Math.min(...paid));
  assert.equal(app.offers.highPrice, Math.max(...paid));
  assert.equal(app.description, company.searchDescription);
});
