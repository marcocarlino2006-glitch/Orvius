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
