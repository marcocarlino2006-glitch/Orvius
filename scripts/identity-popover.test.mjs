import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("identity popover is an Orvius command surface, not a flat link dump", () => {
  const footer = read("src/components/os-sidebar-footer.tsx");
  assert.match(footer, /os-identity-popover/);
  assert.match(footer, /Owner control panel/);
  assert.match(footer, /Search controls/);
  assert.match(footer, /AI receptionist/);
  assert.match(footer, /Phone & call rules/);
  assert.match(footer, /Team & permissions/);
  assert.match(footer, /Security & privacy/);
  assert.match(footer, /Audit log/);
  assert.match(footer, /resolveSystemStatus/);
  assert.match(footer, /Answering|Needs attention|Offline/);
  assert.match(footer, /ArrowDown/);
  assert.match(footer, /Escape/);
  assert.match(footer, /placePanel|position:\s*"fixed"/);
  assert.match(footer, /orvius:open-command-palette/);
  assert.match(footer, /healthKey/);
  assert.match(footer, /Operate/);
  assert.doesNotMatch(footer, /Manus|Cursor Pro|Workspace switcher/i);
});

test("shell opens command palette from identity popover hint", () => {
  const shell = read("src/components/os-shell.tsx");
  assert.match(shell, /orvius:open-command-palette/);
});

test("AI receptionist deep-link lands on a real settings anchor", () => {
  const settings = read("src/app/dashboard/settings/page.tsx");
  assert.match(settings, /id="ai-receptionist"/);
  assert.match(settings, /id="economics-baseline"/);
  assert.match(settings, /id="owner-alerts"/);
  assert.match(settings, /id="overflow-forward"/);
});

test("mission-control CSS styles the identity popover", () => {
  const css = read("src/app/orvius-mission-control.css");
  assert.match(css, /\.os-identity-popover/);
  assert.match(css, /\.os-identity-status--answering/);
  assert.match(css, /\.os-identity-health--ok/);
  assert.match(css, /\.os-identity-popover-head/);
});
