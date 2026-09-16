import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("dashboard routes own loading and error states", () => {
  assert.equal(existsSync(join(root, "src/app/dashboard/loading.tsx")), true);
  assert.equal(existsSync(join(root, "src/app/dashboard/error.tsx")), true);
  assert.equal(existsSync(join(root, "src/app/not-found.tsx")), true);

  const loading = read("src/app/dashboard/loading.tsx");
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /Loading the latest shop state/);
});

test("Command exposes failed refreshes and a real retry action", () => {
  const command = read("src/components/ring1-command-center.tsx");
  assert.match(command, /Connection needs attention/);
  assert.match(command, /Live refresh is temporarily unavailable/);
  assert.match(command, /await load\(\)/);
  assert.match(command, /Try again/);
  assert.doesNotMatch(command, /if \(!res\.ok\) return/);
});

test("Command keeps one flagship hierarchy and one control rail", () => {
  const command = read("src/components/ring1-command-center.tsx");
  const outcomes = command.indexOf("<ProCommandOutcomes");
  const attention = command.indexOf("<AttentionQueue");
  const timeline = command.indexOf("<ProShiftTimeline");

  assert.ok(outcomes >= 0 && attention > outcomes && timeline > attention);
  assert.equal((command.match(/<ProLaunchControl/g) ?? []).length, 1);
  assert.doesNotMatch(command, /<ProNightWatch|<ProLineWatch|<ProSetupScore/);
  assert.match(command, /<ApproveQueue onChange=\{load\} hideWhenEmpty/);

  const queue = read("src/components/attention-queue.tsx");
  assert.match(queue, /items\.slice\(0, 5\)/);

  const shift = read("src/components/pro-shift-timeline.tsx");
  assert.doesNotMatch(shift, /Finish setup before testing the full loop/);
});

test("Settings and loading states use the same owner-system language", () => {
  const settings = read("src/app/dashboard/settings/page.tsx");
  assert.doesNotMatch(settings, /<ProSetupHub/);
  assert.match(settings, /className="account-stack pro-settings-form"/);

  const skeleton = read("src/components/shell-skeleton.tsx");
  assert.match(skeleton, /className="os-lead-rail dashboard-list-skeleton"/);
  assert.doesNotMatch(skeleton, /lead-inbox-card pro-card/);

  const css = read("src/app/dashboard/dashboard.css");
  assert.match(css, /Settings: the same quiet instrument used by Billing/);
  assert.match(css, /\.pro-settings-form > \.pro-panel/);
});

test("the corner account menu is a complete keyboard-accessible control", () => {
  const menu = read("src/components/os-sidebar-footer.tsx");
  const css = read("src/app/globals.css");

  assert.match(menu, /os-profile-menu-account/);
  assert.match(menu, /<OsIcon name=\{item\.icon\}/);
  assert.match(menu, /event\.key === "ArrowDown"/);
  assert.match(menu, /event\.key === "ArrowUp"/);
  assert.match(menu, /event\.key === "Escape"/);
  assert.match(menu, /role="menuitem"/);
  assert.match(css, /width: min\(17\.5rem, calc\(100vw - 1rem\)\)/);
  assert.match(css, /@keyframes os-account-menu-in/);
  assert.match(css, /\.os-profile-menu-link:focus-visible/);
});
