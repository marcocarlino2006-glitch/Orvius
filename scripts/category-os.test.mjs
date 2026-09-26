import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildShopSetupChecklist } from "../src/lib/shop-setup-checklist.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("Settings readiness path runs Business → … → Test call, one next step", () => {
  const empty = buildShopSetupChecklist({});
  assert.deepEqual(
    empty.steps.map((s) => s.id),
    ["identity", "trade", "service_area", "hours", "line", "calendar", "owner_alerts", "verify"],
  );
  assert.equal(empty.next?.id, "identity");
  assert.equal(empty.doneCount, 0);

  const partial = buildShopSetupChecklist({
    name: "Summit Plumbing",
    address: "12 Main St, Denver CO",
    trade: "Plumbing",
    servicesJson: JSON.stringify(["Water heater"]),
    serviceZipsJson: JSON.stringify(["80202"]),
  });
  assert.equal(partial.next?.id, "hours");

  const panel = read("src/components/settings-center/sections/account-section.tsx");
  assert.match(panel, /checklist\.next\.label/);
  assert.match(panel, /checklist\.next\.href/);
});

test("Calendar step is honest: it needs a real crew to book against", () => {
  const base = {
    name: "Summit Plumbing",
    address: "12 Main St, Denver CO",
    trade: "Plumbing",
    servicesJson: JSON.stringify(["Water heater"]),
    serviceZipsJson: JSON.stringify(["80202"]),
    hoursJson: JSON.stringify({ mon: 1, tue: 1, wed: 1, thu: 1, fri: 1 }),
    line: "+13035550100",
    lineVerified: true,
  };
  assert.equal(buildShopSetupChecklist(base).next?.id, "calendar");
  assert.equal(buildShopSetupChecklist({ ...base, crewCount: 2 }).next?.id, "owner_alerts");
});

test("profile popover carries identity, workspace, and the full account menu", () => {
  const footer = read("src/components/os-sidebar-footer.tsx");
  for (const item of ["Profile", "Settings", "Integrations", "Billing", "Help", "Sign out", "Workspace"]) {
    assert.match(footer, new RegExp(item));
  }
  assert.match(footer, /pm-identity/);
  assert.match(footer, /aria-expanded/);
});

test("Ask is one composer with grounded evidence and explained approvals", () => {
  const ask = read("src/app/dashboard/ask/page.tsx");
  assert.match(ask, /ask-composer/);
  assert.equal((ask.match(/<textarea/g) ?? []).length, 1);
  assert.doesNotMatch(ask, />\s*RUN\s*</);
  assert.match(ask, /Evidence/);
  assert.match(ask, /RecordLink/);
  assert.match(ask, /Retry/);

  const actions = read("src/components/copilot-actions.tsx");
  assert.match(actions, /What will happen/);
  assert.match(actions, /Approve and run/);
});

test("design system: one amber accent, semantic status colors, touch-size controls", () => {
  const css = read("src/app/dashboard/orvius-system.css");
  assert.match(css, /--ox-amber:/);
  assert.match(css, /--ox-green:/);
  assert.match(css, /--ox-yellow:/);
  assert.match(css, /--ox-red:/);
  assert.match(css, /pointer: coarse/);
  assert.match(read("src/app/dashboard/layout.tsx"), /orvius-system\.css/);
});

test("list pages open records in the shared drawer", () => {
  for (const file of [
    "src/components/lead-inbox-card.tsx",
    "src/components/call-record-card.tsx",
    "src/components/customer-record-card.tsx",
    "src/components/job-card.tsx",
    "src/app/dashboard/dispatch/page.tsx",
  ]) {
    assert.match(read(file), /<RecordLink/, file);
  }
});
