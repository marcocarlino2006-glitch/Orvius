#!/usr/bin/env node
/*
 * Home, Schedule, Inbox, Customers and Jobs are the places the owner runs.
 * Calls, Work and Ask open from the search at the bottom left of a phone, and from the left sidebar on an iPad or a computer. Money on Home opens the report. A specific call, job or
 * person still has its own URL. Dispatch opens the schedule.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

import { osMoreNav, osNavCurrent, osProductNav, osWideNav, osWorkspaceNav } from "../src/lib/os-nav.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const PLACES = ["/dashboard", "/dashboard/schedule", "/dashboard/inbox", "/dashboard/customers", "/dashboard/jobs"];

test("the bar is the five places the owner runs", () => {
  assert.deepEqual(
    osProductNav.map((item) => item.href),
    PLACES,
  );
  assert.deepEqual(
    osMoreNav.map((item) => item.href),
    ["/dashboard/calls", "/dashboard/work", "/dashboard/ask"],
  );
  assert.deepEqual(
    osWorkspaceNav.map((item) => item.href),
    ["/dashboard/team", "/dashboard/settings", "/dashboard/price-book", "/dashboard/profile", "/dashboard/billing"],
  );
  assert.equal(osNavCurrent("/dashboard", "/dashboard"), true);
  assert.equal(osNavCurrent("/dashboard/jobs/abc", "/dashboard"), false);
  assert.equal(osNavCurrent("/dashboard/jobs/abc", "/dashboard/jobs"), true);
  assert.deepEqual(
    osWideNav.map((item) => item.label),
    ["Home", "Schedule", "Inbox", "Calls", "Customers", "Jobs", "Work", "Ask"],
  );
});

test("the operating pages stay open, and dispatch opens the schedule", () => {
  const config = read("next.config.ts");
  for (const source of [...PLACES.slice(1), ...osMoreNav.map((item) => item.href)]) {
    assert.doesNotMatch(config, new RegExp(`source: "${source}"`), `${source} is a page`);
  }
  assert.match(config, /source: "\/dashboard\/dispatch"/);
  assert.match(config, /destination: "\/dashboard\/schedule"/);
  assert.match(read("src/app/dashboard/dispatch/page.tsx"), /redirect\("\/dashboard\/schedule"\)/);
  for (const page of ["calls/[id]/page.tsx", "jobs/[id]/page.tsx", "customers/[id]/page.tsx", "inbox/[id]/page.tsx"]) {
    assert.ok(existsSync(new URL(`../src/app/dashboard/${page}`, import.meta.url)), `${page} still opens`);
  }
});

test("the shell paints the five places, and Work is not a table", () => {
  const work = read("src/app/dashboard/work/page.tsx");
  assert.match(work, /<WorkCard /);
  assert.doesNotMatch(work, /role="table"/);
  const shell = read("src/components/os-shell.tsx");
  assert.match(shell, /os-sidebar-nav/);
  assert.match(shell, /os-tabbar/);
  assert.match(shell, /os-phone-search/);
  assert.doesNotMatch(shell, /os-tab-search/);
  assert.match(read("src/app/dashboard/orvius.css"), /repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(read("src/components/os-command-palette.tsx"), /Search the shop/);
  assert.match(read("src/components/os-command-palette.tsx"), /group: "Places"/);
  assert.doesNotMatch(read("src/components/os-command-palette.tsx"), /Screen/);
  assert.match(shell, /osProductNav/);
  assert.match(shell, /osWideNav/);
  assert.doesNotMatch(shell, /os-product-nav/);
  assert.match(read("src/components/desk-board.tsx"), /href="\/dashboard\/schedule"/);
  assert.match(read("src/components/desk-board.tsx"), /href="\/dashboard\/reports"/);
  assert.match(read("src/components/os-command-palette.tsx"), /osMoreNav/);
});

test("palette search cancels the request a newer keystroke replaced", () => {
  const palette = read("src/components/os-command-palette.tsx");
  assert.match(palette, /new AbortController\(\)/);
  assert.match(palette, /signal: controller\.signal/);
  assert.match(palette, /controller\.abort\(\)/);
});
