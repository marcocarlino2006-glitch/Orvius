#!/usr/bin/env node
/*
 * One door, not sixteen sections. The primary nav is five destinations an
 * owner actually opens daily; Inbox, Jobs, Team and the rest keep their URLs
 * and stay one Search away, but no longer compete in the sidebar. Work is
 * the single queue — Requests and Jobs are filters of it, not sections.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

import { OS_NAV_ALIASES, osProductNav, osWorkspaceNav } from "../src/lib/os-nav.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("primary nav is five doors", () => {
  assert.deepEqual(
    osProductNav.map((i) => i.href),
    ["/dashboard", "/dashboard/work", "/dashboard/schedule", "/dashboard/calls", "/dashboard/customers"],
  );
  for (const gone of ["/dashboard/inbox", "/dashboard/jobs", "/dashboard/team"]) {
    assert.ok(!osProductNav.some((i) => i.href === gone), `${gone} left the sidebar`);
    assert.ok(osWorkspaceNav.some((i) => i.href === gone), `${gone} is still reachable from Search`);
  }
});

test("the demoted sections still exist and light up Work in the nav", () => {
  for (const page of ["inbox/page.tsx", "jobs/page.tsx", "team/page.tsx", "work/page.tsx"]) {
    assert.ok(existsSync(new URL(`../src/app/dashboard/${page}`, import.meta.url)), `${page} keeps its URL`);
  }
  assert.deepEqual(OS_NAV_ALIASES["/dashboard/work"], ["/dashboard/inbox", "/dashboard/jobs", "/dashboard/price-book"]);
  assert.deepEqual(OS_NAV_ALIASES["/dashboard"], ["/dashboard/ask"], "Ask stays under Command");
});

test("Work is the one queue, and the shell does not paint departments", () => {
  const work = read("src/app/dashboard/work/page.tsx");
  assert.match(work, /id: "requests", label: "Requests", match: \(i\) => i\.kind === "request"/);
  assert.match(work, /id: "jobs", label: "Jobs", match: \(i\) => i\.kind === "job"/);
  assert.match(work, /<WorkCard /, "Work is the same card as Command");
  assert.doesNotMatch(work, /role="table"/, "Work is not a table");
  const shell = read("src/components/os-shell.tsx");
  assert.doesNotMatch(shell, /os-sidebar-nav|OsTabBar|TAB_HREFS/, "departments are not painted on the desk or the phone");
  assert.match(shell, /os-topbar-shop-name/, "the shop lives in the top bar");
});
