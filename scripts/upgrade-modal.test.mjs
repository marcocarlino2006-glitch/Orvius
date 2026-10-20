#!/usr/bin/env node
/*
 * Upgrading happens where the owner already is: the account menu shows the
 * shop's real answered-call usage, Upgrade opens an in-app plan picker, and
 * the picker only ever sends the owner to a checkout the server agreed to —
 * no invented prices, no "$0 due" that isn't, no points balance dressed up
 * as usage.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the account menu shows real usage, and Upgrade opens the picker in place", () => {
  const footer = read("src/components/os-sidebar-footer.tsx");
  assert.match(footer, /account\?\.billing\?\.usage/, "the menu reads the usage the account API already returns");
  assert.match(footer, /callUsageLine\(usage\)/, "usage is stated in answered calls, not converted to points");
  assert.match(footer, /mx-meter/, "the included-calls meter renders in the plan block");
  assert.match(footer, /setUpgradeOpen\(true\)/, "Upgrade opens the modal instead of bouncing to a billing page");
  assert.match(footer, /<UpgradeModal/);
  assert.match(footer, /livePlan \? \(/, "a shop already paying is kept on the billing portal path");
  assert.match(footer, /settings=billing/, "the Billing row and the portal path stay");
});

test("the picker mounts at the shell root, never inside the sidebar's stacking context", () => {
  const modal = read("src/components/upgrade-modal.tsx");
  assert.match(modal, /createPortal/, "the overlay portals out of the sidebar footer");
  assert.match(modal, /document\.querySelector\("\.os-shell"\) \?\? document\.body/, "to the shell root (body as fallback), where its z-index faces the page directly");
});

test("the picker prices every plan from checkout's own read", () => {
  const modal = read("src/components/upgrade-modal.tsx");
  assert.match(modal, /fetch\("\/api\/billing\/checkout", \{ cache: "no-store" \}\)/);
  assert.match(modal, /getPlanById\(plan\.id\)\.highlights/, "benefits come from the plan source of truth");
  assert.match(modal, /ANNUAL_DISCOUNT_LABEL/, "the annual saving is the labelled one, not a rounded invention");
  assert.match(modal, /annualChargeDollars/, "the yearly charge is the real once-a-year amount");
  assert.match(modal, /due today/, "the amount due today is named before checkout opens");
  assert.doesNotMatch(modal, /\$0 due|free trial|\bcredits\b/i, "nothing is promised that billing doesn't do");
});

test("the picker follows checkout's refusals instead of arguing with them", () => {
  const modal = read("src/components/upgrade-modal.tsx");
  assert.match(modal, /method: "POST"/);
  assert.match(modal, /planId: selected\.id, interval/);
  assert.match(modal, /already_subscribed/);
  assert.match(modal, /window\.location\.href = data\.manageUrl/, "a paying shop goes to plan management");
  assert.match(modal, /setup_incomplete/);
  assert.match(modal, /window\.location\.href = data\.setupUrl/, "an unfinished setup finishes first");
  assert.match(modal, /self_serve_signup_disabled/);
  assert.match(modal, /window\.location\.href = data\.url/, "a granted checkout opens");
  assert.match(modal, /if \(!open\) return null/, "closed means closed — no fetch, no surface");
});

test("the account popover and the picker follow the day theme like the settings dialog", () => {
  const css = read("src/app/dashboard/orvius-system.css");
  assert.match(css, /html\[data-theme="day"\] \.os-shell\.os-shell-night \.mx-menu \{/);
  assert.match(css, /html\[data-theme="day"\] \.os-shell\.os-shell-night \.mx-menu \.mx-upgrade \{/);
  assert.match(css, /\.os-shell\.os-shell-night \.upg-backdrop \{/);
  assert.match(
    css,
    /--upg-bg: var\(--ox-panel\)/,
    "the picker reads the theme tokens, so it follows the colorway instead of hardcoding one",
  );
  assert.match(css, /\.os-shell\.os-shell-night \.upg-cta \{/);
});

test("an empty schedule day points at booking work and at the calls behind it", () => {
  const page = read("src/app/dashboard/schedule/page.tsx");
  assert.match(page, /Nothing scheduled this day[\s\S]{0,900}?ox-btn--primary/, "booking a job is the primary next step");
  assert.match(page, /Nothing scheduled this day[\s\S]{0,900}?\/dashboard\/calls/, "today's answered calls are one tap away");
});
