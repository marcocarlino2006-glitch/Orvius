import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("OpsBriefing ships the six Command lanes and business graph", () => {
  assert.equal(existsSync(join(root, "src/components/ops-briefing.tsx")), true);
  const briefing = read("src/components/ops-briefing.tsx");
  for (const lane of [
    "Came in",
    "Understood",
    "Happened",
    "Needs you",
    "Money moving",
    "Recommends",
  ]) {
    assert.match(briefing, new RegExp(lane));
  }
  assert.match(
    briefing,
    /Call → Lead → Customer → Property → Job → Technician → Estimate →/,
  );
  assert.match(briefing, /#attention-board/);
  assert.match(briefing, /#agent-control/);
  assert.doesNotMatch(briefing, /guaranteed revenue/i);
});

test("Command mounts OpsBriefing always — never XOR with attention", () => {
  const command = read("src/components/ring1-command-center.tsx");
  assert.match(command, /<OpsBriefing/);
  assert.match(command, /<AttentionQueue/);
  assert.match(command, /<ApproveQueue/);
  assert.match(command, /<ProShiftTimeline/);
  assert.doesNotMatch(command, /workMode/);
  assert.doesNotMatch(command, /attentionCount > 0/);
  assert.doesNotMatch(command, /<ProCommandOutcomes/);

  const briefingIdx = command.indexOf("<OpsBriefing");
  const attentionIdx = command.indexOf("<AttentionQueue");
  const approveIdx = command.indexOf("<ApproveQueue");
  const trailIdx = command.indexOf("<ProShiftTimeline");
  assert.ok(briefingIdx >= 0 && attentionIdx > briefingIdx);
  assert.ok(approveIdx > attentionIdx && trailIdx > approveIdx);
});

test("ApproveQueue keeps an approval button and agent-control anchor", () => {
  const approve = read("src/components/approve-queue.tsx");
  assert.match(approve, /id="agent-control"/);
  assert.match(approve, /"Approve"/);
  assert.match(approve, /Needs your OK/);
});

test("operating console CSS styles the six-lane briefing", () => {
  const css = read("src/app/dashboard/dashboard.css");
  assert.match(css, /\.ops-briefing-lanes/);
  assert.match(css, /\.ops-briefing-graph/);
  assert.match(css, /Operating console — six-lane briefing/);
});
