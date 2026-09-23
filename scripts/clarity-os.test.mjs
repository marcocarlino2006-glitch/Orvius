import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const require = createRequire(import.meta.url);

test("clarity contract defines four questions and workflow language", () => {
  const lib = read("src/lib/clarity.ts");
  assert.match(lib, /ClarityPurpose/);
  assert.match(lib, /what:/);
  assert.match(lib, /happening/);
  assert.match(lib, /consequence/);
  assert.match(lib, /call → customer|WORKFLOW_STAGE_LABEL/);
  assert.match(lib, /PAGE_CLARITY/);
  assert.match(lib, /buildRecordTrail/);
  for (const stage of [
    "call",
    "customer",
    "job",
    "estimate",
    "payment",
    "followup",
  ]) {
    assert.match(lib, new RegExp(stage));
  }
});

test("clarity primitives answer What / Happening / Next / Consequence", () => {
  const ui = read("src/components/clarity.tsx");
  assert.match(ui, /ClarityPurposeBar/);
  assert.match(ui, /Happening/);
  assert.match(ui, /Next/);
  assert.match(ui, /If you do/);
  assert.match(ui, /ClarityEmpty/);
  assert.match(ui, /ClarityFailure/);
  assert.match(ui, /Cause/);
  assert.match(ui, /Impact/);
  assert.match(ui, /Recover/);
  assert.match(ui, /WorkflowTrail/);
});

test("OsShell renders the four-question purpose bar when provided", () => {
  const shell = read("src/components/os-shell.tsx");
  assert.match(shell, /clarity\?:/);
  assert.match(shell, /ClarityPurposeBar/);
  assert.match(shell, /clarity \? <ClarityPurposeBar/);
});

test("core list pages wire PAGE_CLARITY", () => {
  for (const [path, key] of [
    ["src/app/dashboard/page.tsx", "command"],
    ["src/app/dashboard/inbox/page.tsx", "inbox"],
    ["src/app/dashboard/calls/page.tsx", "calls"],
    ["src/app/dashboard/jobs/page.tsx", "jobs"],
    ["src/app/dashboard/settings/page.tsx", "settings"],
    ["src/app/dashboard/customers/page.tsx", "customers"],
  ]) {
    const src = read(path);
    assert.match(src, /PAGE_CLARITY/);
    assert.match(src, new RegExp(`PAGE_CLARITY\\.${key}|clarity=\\{`));
    assert.match(src, /clarity=/);
  }
});

test("list pages use intelligent empty and failure recovery", () => {
  for (const path of [
    "src/app/dashboard/inbox/page.tsx",
    "src/app/dashboard/calls/page.tsx",
    "src/app/dashboard/jobs/page.tsx",
    "src/app/dashboard/customers/page.tsx",
  ]) {
    const src = read(path);
    assert.match(src, /ClarityEmpty/);
    assert.match(src, /ClarityFailure/);
    assert.match(src, /consequence=/);
    assert.match(src, /recovery=/);
  }
});

test("detail pages expose a one-click workflow trail", () => {
  for (const path of [
    "src/app/dashboard/calls/[id]/page.tsx",
    "src/app/dashboard/inbox/[id]/page.tsx",
    "src/app/dashboard/jobs/[id]/page.tsx",
    "src/app/dashboard/customers/[id]/page.tsx",
  ]) {
    const src = read(path);
    assert.match(src, /WorkflowTrail/);
    assert.match(src, /buildRecordTrail/);
  }
});

test("settings savebar states the live-line business consequence", () => {
  const settings = read("src/app/dashboard/settings/page.tsx");
  assert.match(settings, /how Orvius answers/);
  assert.match(settings, /who gets alerts/);
  assert.match(settings, /ClarityFailure/);
});

test("mission-control styles the clarity surfaces", () => {
  const css = read("src/app/orvius-mission-control.css");
  assert.match(css, /\.clarity-purpose/);
  assert.match(css, /\.clarity-empty/);
  assert.match(css, /\.clarity-failure/);
  assert.match(css, /\.workflow-trail/);
  assert.match(css, /Clarity OS/);
});

test("buildRecordTrail marks current and prior linked stages", () => {
  let clarity;
  try {
    clarity = require(join(root, "src/lib/clarity.ts"));
  } catch {
    // Strip-types load via node --experimental-strip-types path below.
  }
  if (!clarity) {
    const { spawnSync } = require("node:child_process");
    const probe = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--input-type=module",
        "-e",
        `
import { buildRecordTrail } from ${JSON.stringify(join(root, "src/lib/clarity.ts"))};
const trail = buildRecordTrail({
  callId: "c1",
  customerId: "cu1",
  jobId: "j1",
  current: "job",
});
console.log(JSON.stringify(trail.map((t) => ({ id: t.id, state: t.state, href: !!t.href }))));
`,
      ],
      { encoding: "utf8" },
    );
    assert.equal(probe.status, 0, probe.stderr);
    const trail = JSON.parse(probe.stdout.trim());
    const byId = Object.fromEntries(trail.map((t) => [t.id, t]));
    assert.equal(byId.call.state, "done");
    assert.equal(byId.customer.state, "done");
    assert.equal(byId.job.state, "current");
    assert.equal(byId.estimate.state, "waiting");
    assert.equal(byId.call.href, true);
    return;
  }
  const trail = clarity.buildRecordTrail({
    callId: "c1",
    customerId: "cu1",
    jobId: "j1",
    current: "job",
  });
  assert.equal(trail.find((t) => t.id === "call").state, "done");
  assert.equal(trail.find((t) => t.id === "job").state, "current");
});
