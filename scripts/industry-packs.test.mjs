/*
 * Orvius answers for any business that runs on the phone, not just HVAC. Each
 * industry picks a pack: what callers ask for, what counts as an emergency,
 * and whether the call needs an address at all. A dentist's receptionist that
 * asks for a "full service address", or an HVAC prompt that quietly lost its
 * gas-leak rule while the office variant was added, would both be real harm,
 * so both directions are pinned here.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { buildAssistantSystemPrompt } from "../src/lib/business.ts";
import { servicesForTrade } from "../src/lib/provision-business.ts";
import { buildPreviewAssistant } from "../src/lib/shop-preview.ts";
import { classifyRequest, TRADE_PLAYBOOKS } from "../src/lib/trade-playbooks.ts";
import { INDUSTRY_KIND, TRADES, industryKind, inferTradeFromBusiness, isTrade } from "../src/lib/trades.ts";

const prompt = (extra) =>
  buildAssistantSystemPrompt({ name: "Bright Smile Dental", greeting: null, hoursJson: "{}", servicesJson: "[]", ...extra });

test("every business type has a kind, default services and a playbook", () => {
  for (const trade of TRADES) {
    assert.ok(INDUSTRY_KIND[trade], `${trade} has a kind`);
    const services = JSON.parse(servicesForTrade(trade));
    assert.ok(services.length > 0, `${trade} starts with services`);
    assert.equal(TRADE_PLAYBOOKS[trade]?.trade, trade, `${trade} has a playbook`);
  }
  assert.equal(industryKind("HVAC"), "field");
  assert.equal(industryKind("Dental office"), "office");
  assert.equal(industryKind(null), "field");
  assert.equal(industryKind("Not a trade"), "field");
  assert.equal(isTrade("Salon & spa"), true);
  assert.equal(isTrade("Other"), false);
  assert.equal(isTrade(null), false);
});

test("an office business never asks for a home address and sends emergencies to 911", () => {
  for (const trade of TRADES.filter((t) => industryKind(t) === "office")) {
    for (const canBook of [false, true]) {
      const text = prompt({ trade, canBook, canTransfer: canBook });
      assert.match(text, /Do not ask for a home address/, trade);
      assert.doesNotMatch(text, /full service address/, trade);
      assert.doesNotMatch(text, /technician/i, trade);
      assert.match(text, /Please hang up and call 911 now/, trade);
      assert.match(text, /988/, trade);
      assert.match(text, /NEVER give medical, legal, financial or other professional advice/, trade);
      assert.match(text, /^(INDUSTRY) — /m, `${trade} carries its pack`);
      assert.match(text, /Confirm: name, callback number \(read it back\), what they need, urgency\.$/m);
    }
  }
  const booking = prompt({ trade: "Salon & spa", canBook: true });
  assert.match(booking, /call check_availability/);
  assert.match(booking, /call hold_new_time, never hold_appointment/);
  assert.match(booking, /Never book an emergency/);
});

test("field businesses keep the field prompt, gas rule and address included", () => {
  for (const trade of TRADES.filter((t) => industryKind(t) === "field")) {
    const text = prompt({ name: "Summit Service", trade });
    assert.match(text, /Collect: full service address/, trade);
    assert.match(text, /DANGER — only gas smell/, trade);
    assert.doesNotMatch(text, /Do not ask for a home address/, trade);
  }
});

test("a name that only sounds like an office keeps the field prompt until the owner picks", () => {
  // Existing shops have no stored industry; guessing "office" from a name
  // would silently stop asking them for addresses.
  assert.equal(inferTradeFromBusiness({ name: "Bright Smile Dental" }), "Dental office");
  const guessed = prompt({ trade: null });
  assert.match(guessed, /Collect: full service address/);
  assert.doesNotMatch(guessed, /INDUSTRY — DENTAL/);
  const picked = prompt({ trade: "Dental office" });
  assert.match(picked, /INDUSTRY — DENTAL OFFICE/);
});

test("new industries are recognised from their names, and old ones still are", () => {
  const shops = [
    ["Glow Hair Salon", "Salon & spa"],
    ["Main Street Auto Repair", "Auto repair"],
    ["Hughes & Park Law", "Law office"],
    ["Oak Realty", "Real estate"],
    ["Ace Locksmith", "Locksmith"],
    ["Peak Roofing", "Roofing"],
    ["Summit HVAC", "HVAC"],
    ["Hollis Plumbing", "Plumbing"],
    ["Cedar Electric", "Electrical"],
  ];
  for (const [name, expected] of shops) assert.equal(inferTradeFromBusiness({ name }), expected, name);
  assert.equal(inferTradeFromBusiness({ name: "Generic Shop" }), null);
});

test("office requests map to real services and emergencies reach a human", () => {
  const dental = classifyRequest({ business: { trade: "Dental office" }, serviceType: "toothache on the left side" });
  assert.equal(dental.trade, "Dental office");
  assert.equal(dental.service.key, "tooth_pain");
  assert.equal(dental.safety, null);

  const medical = classifyRequest({ business: { trade: "Medical office" }, serviceType: "my dad has chest pain" });
  assert.equal(medical.safety?.key, "medical_emergency");

  const salon = classifyRequest({ business: { trade: "Salon & spa" }, serviceType: "haircut and highlights" });
  assert.equal(salon.service.key, "haircut");
  assert.equal(salon.safety, null);

  const other = classifyRequest({ business: { trade: "Other business" }, serviceType: "I'd like to come in Friday" });
  assert.equal(other.service.label, "Appointment");

  const lockout = classifyRequest({ business: { trade: "Locksmith" }, serviceType: "my baby is locked inside the car" });
  assert.equal(lockout.safety?.key, "locked_in_car");

  const hvacGas = classifyRequest({ business: { trade: "HVAC" }, serviceType: "I smell gas by the furnace" });
  assert.equal(hvacGas.safety?.key, "gas_smell", "the HVAC gas rule still wins");
});

test("a preview answers as the business type the owner picked", () => {
  const base = { id: "p1", shopName: "Bright Smile Dental", serviceArea: null, servicesJson: "[]", hoursJson: "{}" };
  const office = buildPreviewAssistant({ ...base, trade: "Dental office" });
  const officePrompt = JSON.stringify(office);
  assert.match(officePrompt, /INDUSTRY — DENTAL OFFICE/);
  assert.match(officePrompt, /The business owner is trying you out/);
  assert.doesNotMatch(officePrompt, /technician is booked/);

  const legacy = JSON.stringify(buildPreviewAssistant({ ...base, shopName: "Summit HVAC" }));
  assert.match(legacy, /TRADE — HVAC/);
  assert.match(legacy, /Never say a technician is booked/);
});

test("the dashboard speaks each business's language", async () => {
  const { industryTerms } = await import("../src/lib/industry-terms.ts");
  assert.equal(industryTerms("HVAC").Jobs, "Jobs");
  assert.equal(industryTerms("HVAC").Dispatch, "Dispatch");
  assert.equal(industryTerms(null).worker, "tech", "a shop with no type keeps the words it had");
  assert.equal(industryTerms("Dental office").Jobs, "Appointments");
  assert.equal(industryTerms("Salon & spa").Dispatch, "Schedule");
  assert.equal(industryTerms("Law office").worker, "team member");
});

test("public pages speak to every business, not only HVAC shops", async () => {
  const { readFileSync } = await import("node:fs");
  const pages = [
    "src/components/marketing-shell.tsx",
    "src/app/product/page.tsx",
    "src/app/enterprise/page.tsx",
    "src/app/pilot/page.tsx",
    "src/components/home-line-hero.tsx",
    "src/lib/i18n.ts",
  ];
  for (const file of pages) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(text, /receptionist for HVAC|HVAC receptionist|multi-shop HVAC|your HVAC shop/i, file);
  }
});
