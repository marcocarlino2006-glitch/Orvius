import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("Command TODAY briefing never hides behind the attention board", () => {
  const outcomes = read("src/components/pro-command-outcomes.tsx");
  assert.doesNotMatch(outcomes, /attentionCount > 0\) return null/);
  assert.match(outcomes, /buildCommandBriefing/);
  assert.match(outcomes, /Today’s briefing|Briefing/);
});

test("Command mounts workflow strip, briefing, and priority queue", () => {
  const command = read("src/components/ring1-command-center.tsx");
  assert.match(command, /CommandWorkflowStrip/);
  assert.match(command, /data\?\.today/);
  assert.match(command, /ProCommandOutcomes/);
  assert.match(command, /AttentionQueue/);
  assert.match(command, /nextAppointment/);
  assert.match(command, /revenueAtRiskCents/);
});

test("Dashboard Command home has no stacked Next Gate or operate banners", () => {
  const page = read("src/app/dashboard/page.tsx");
  assert.match(page, /FirstNightHandoff/);
  assert.match(page, /Ring1CommandCenter/);
  assert.doesNotMatch(page, /FounderNextGate|ShopOperateBanner/);
});

test("Priority queue explains impact and one-click resolution", () => {
  const queue = read("src/components/attention-queue.tsx");
  assert.match(queue, /Priority queue/);
  assert.match(queue, /Impact/);
  assert.match(queue, /Do this/);
  assert.match(queue, /Reconnect SMS/);
  assert.match(queue, /Send test alert/);
});

test("Shop pulse shows line, after-hours, unresolved, next appt, risk", () => {
  const pulse = read("src/components/pro-launch-control.tsx");
  assert.match(pulse, /Live line/);
  assert.match(pulse, /After hours/);
  assert.match(pulse, /Unresolved/);
  assert.match(pulse, /Next appt/);
  assert.match(pulse, /Revenue at risk/);
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

test("Failed owner alerts carry business impact copy", () => {
  const queue = read("src/lib/attention-queue.ts");
  assert.match(queue, /Owner alerts failed/);
  assert.match(queue, /may not have reached you|may not have been received/);
  assert.match(queue, /Reconnect SMS or send test alert/);
});
