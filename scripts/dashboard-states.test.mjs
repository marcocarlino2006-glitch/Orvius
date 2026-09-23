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
  const ctx = read("src/lib/ring1-context.tsx");
  assert.match(command, /Connection needs attention/);
  assert.match(command, /useRing1/);
  assert.match(command, /await refresh\(\)/);
  assert.match(command, /Try again/);
  assert.match(ctx, /Live refresh is temporarily unavailable/);
  assert.doesNotMatch(command, /fetch\("\/api\/ring1"\)/);
});

test("Command keeps one flagship hierarchy and one control rail", () => {
  const command = read("src/components/ring1-command-center.tsx");

  // Always-on operating console: briefing + board + trail. Never XOR pulse away.
  assert.doesNotMatch(command, /workMode/);
  assert.match(command, /<OpsBriefing/);
  assert.match(command, /<AttentionQueue/);
  assert.match(command, /<ProShiftTimeline/);
  assert.doesNotMatch(command, /<ProCommandOutcomes/);
  assert.equal((command.match(/<ProLaunchControl/g) ?? []).length, 1);
  assert.doesNotMatch(command, /<ProNightWatch|<ProLineWatch|<ProSetupScore/);
  assert.match(command, /<ApproveQueue onChange=\{/);

  const queue = read("src/components/attention-queue.tsx");
  assert.match(queue, /items\.slice\(0, 5\)/);

  const shift = read("src/components/pro-shift-timeline.tsx");
  assert.doesNotMatch(shift, /Finish setup before testing the full loop/);
});

test("Dashboard shares one Ring1 pulse across shell and Command", () => {
  const layout = read("src/app/dashboard/layout.tsx");
  const ctx = read("src/lib/ring1-context.tsx");
  const business = read("src/lib/use-business.ts");
  const banner = read("src/components/shop-operate-banner.tsx");
  assert.match(layout, /Ring1Provider/);
  assert.match(ctx, /Ring1Provider/);
  assert.match(ctx, /useOptionalRing1/);
  // Shell chrome prefers the provider pulse; standalone fetch is only the
  // admin/domains fallback when no Ring1Provider wraps OsShell.
  assert.match(business, /useOptionalRing1/);
  assert.match(banner, /useRing1/);
  assert.doesNotMatch(banner, /fetch\("\/api\/ring1"\)/);
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
