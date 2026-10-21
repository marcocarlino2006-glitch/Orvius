#!/usr/bin/env node
/*
 * The owner lives on Command. The old departments are not destinations.
 * A specific call, job or person still has a URL. Search reaches the rules.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

import { osProductNav, osWorkspaceNav } from "../src/lib/os-nav.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const DEPARTMENTS = [
  "/dashboard/work",
  "/dashboard/schedule",
  "/dashboard/calls",
  "/dashboard/customers",
  "/dashboard/inbox",
  "/dashboard/jobs",
  "/dashboard/ask",
  "/dashboard/reports",
  "/dashboard/dispatch",
];

test("Search does not offer the old departments", () => {
  assert.deepEqual(osProductNav, []);
  for (const href of DEPARTMENTS) {
    assert.ok(!osWorkspaceNav.some((item) => item.href === href), `${href} is not a place to go`);
  }
  assert.deepEqual(
    osWorkspaceNav.map((item) => item.href),
    ["/dashboard/team", "/dashboard/settings", "/dashboard/price-book", "/dashboard/profile", "/dashboard/billing"],
  );
});

test("department indexes send the owner back to Command", () => {
  const config = read("next.config.ts");
  for (const source of DEPARTMENTS) {
    assert.match(config, new RegExp(`"${source}"`), `${source} redirects`);
  }
  assert.match(config, /destination: "\/dashboard"/);
  for (const page of ["calls/[id]/page.tsx", "jobs/[id]/page.tsx", "customers/[id]/page.tsx", "inbox/[id]/page.tsx"]) {
    assert.ok(existsSync(new URL(`../src/app/dashboard/${page}`, import.meta.url)), `${page} still opens`);
  }
});

test("the shell does not paint departments, and Work is not a table if the file is still here", () => {
  const work = read("src/app/dashboard/work/page.tsx");
  assert.match(work, /<WorkCard /);
  assert.doesNotMatch(work, /role="table"/);
  const shell = read("src/components/os-shell.tsx");
  assert.doesNotMatch(shell, /os-sidebar-nav|OsTabBar|TAB_HREFS/);
  assert.match(shell, /os-topbar-shop-name/);
  assert.doesNotMatch(read("src/components/ring1-command-center.tsx"), /The rest is in Work/);
});
