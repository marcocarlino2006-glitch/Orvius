import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("Command TODAY strip never hides behind the attention board", () => {
  const outcomes = read("src/components/pro-command-outcomes.tsx");
  assert.doesNotMatch(outcomes, /attentionCount > 0\) return null/);
  assert.match(outcomes, /Calls answered/);
  assert.match(outcomes, /Missed recovered/);
  assert.match(outcomes, /Appointments booked/);
});

test("Command mounts workflow strip and today pulse", () => {
  const command = read("src/components/ring1-command-center.tsx");
  assert.match(command, /CommandWorkflowStrip/);
  assert.match(command, /data\?\.today/);
});

test("wedge nav keeps Dispatch and Ask out of daily primary", () => {
  const nav = read("src/lib/os-nav.ts");
  assert.match(nav, /label: "Command"/);
  assert.match(nav, /label: "Jobs"/);
  assert.doesNotMatch(
    nav.slice(nav.indexOf("osProductNav"), nav.indexOf("osWorkspaceNav")),
    /Dispatch|Ask/,
  );
  assert.match(nav, /osWorkspaceNav[\s\S]*Dispatch/);
});

test("call detail exposes AI situation panel", () => {
  const page = read("src/app/dashboard/calls/[id]/page.tsx");
  const api = read("src/app/api/calls/[id]/route.ts");
  assert.match(page, /AiSituationPanel/);
  assert.match(api, /understood/);
  assert.match(api, /confidence/);
});

test("HVAC qualification uses taxonomy categories", () => {
  const form = read("src/components/lead-qualification-form.tsx");
  assert.match(form, /HVAC problem/);
  assert.match(form, /DEMAND_CATEGORIES/);
});
