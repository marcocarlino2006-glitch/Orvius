import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildCommandSignals,
  formatAge,
  groupWorkItems,
  revenueAtRiskCents,
} from "../src/lib/command-model.ts";
import { isRecordType, recordHref } from "../src/lib/record-types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

function item(over) {
  return {
    id: over.id,
    kind: over.kind ?? "new_lead",
    rank: over.rank ?? 50,
    impact: over.impact ?? "med",
    title: over.title ?? "New lead",
    detail: over.detail ?? "Water heater leaking",
    recommendedAction: "Call back",
    href: "/dashboard/inbox",
    entityType: over.entityType ?? "lead",
    entityId: over.entityId ?? over.id,
    createdAt: over.createdAt ?? "2026-09-24T10:00:00.000Z",
    estimatedRevenueCents: over.estimatedRevenueCents ?? null,
    group: over.group,
  };
}

const counts = {
  windowDays: 7,
  calls: 4,
  messagesAndWeb: 1,
  qualified: 3,
  booked: 2,
  jobsInMotion: 2,
  jobsUnassigned: 1,
  avgTicketSet: true,
};

test("repeated alert failures collapse into one incident row", () => {
  const work = groupWorkItems([
    item({ id: "a1", kind: "alert_failed", impact: "high", entityType: "shop", createdAt: "2026-09-24T08:00:00.000Z", detail: "SMS bounced" }),
    item({ id: "a2", kind: "alert_failed", impact: "critical", entityType: "shop", createdAt: "2026-09-24T09:00:00.000Z", detail: "Carrier rejected" }),
    item({ id: "a3", kind: "alert_failed", impact: "high", entityType: "shop", createdAt: "2026-09-24T07:00:00.000Z" }),
    item({ id: "l1", group: { key: "c1", label: "Dana Ruiz" }, estimatedRevenueCents: 45000 }),
  ]);
  assert.equal(work.length, 2);
  const incident = work.find((w) => w.id === "incident:alert_failed");
  assert.ok(incident);
  assert.equal(incident.occurrences, 3);
  assert.equal(incident.severity, "critical");
  assert.equal(incident.subject, "Owner alerts are not delivering");
  assert.match(incident.request, /^3 failures · latest: Carrier rejected/);
  assert.equal(incident.firstSeenAt, "2026-09-24T07:00:00.000Z");
  assert.equal(work[0].id, "incident:alert_failed", "critical sorts first");
  assert.equal(work[1].subject, "Dana Ruiz");
});

test("work rows never repeat the customer name in the request line", () => {
  const [grouped, bare] = groupWorkItems([
    item({ id: "g", title: "Dana Caller", group: { key: "c", label: "Dana Caller" }, rank: 1 }),
    item({ id: "b", title: "Dana Caller · $99 deposit", rank: 2 }),
  ]);
  assert.equal(grouped.subject, "Dana Caller");
  assert.equal(grouped.kindLabel, "");
  assert.equal(bare.subject, "Dana Caller");
  assert.equal(bare.kindLabel, "$99 deposit");
});

test("Command ships five truthful signals and never a bare $0", () => {
  const work = groupWorkItems([
    item({ id: "l1", impact: "critical", estimatedRevenueCents: 45000 }),
    item({ id: "l2", estimatedRevenueCents: 30000 }),
  ]);
  const signals = buildCommandSignals(counts, work);
  assert.deepEqual(
    signals.map((s) => s.label),
    ["New demand", "Qualified opportunities", "Jobs in motion", "Attention required", "Revenue at risk"],
  );
  assert.equal(signals[0].value, "5");
  assert.equal(signals[3].value, "2");
  assert.equal(signals[3].tone, "risk");
  assert.equal(signals[4].value, "$750");
  assert.equal(revenueAtRiskCents(work), 75000);
  for (const s of signals) assert.ok(s.href, `${s.id} is clickable`);

  const empty = buildCommandSignals(
    { ...counts, calls: 0, messagesAndWeb: 0, avgTicketSet: false },
    [],
  );
  assert.equal(empty[4].value, "Not set");
  assert.match(empty[0].detail, /No calls or messages/);
  assert.equal(empty[3].detail, "Queue is clear");
  assert.ok(empty.every((s) => s.value !== "$0"));
  assert.equal(buildCommandSignals(counts, [])[4].value, "None");
});

test("work age is human, not a timestamp", () => {
  const now = Date.parse("2026-09-24T12:00:00.000Z");
  assert.equal(formatAge("2026-09-24T11:59:40.000Z", now), "just now");
  assert.equal(formatAge("2026-09-24T11:15:00.000Z", now), "45m");
  assert.equal(formatAge("2026-09-24T09:00:00.000Z", now), "3h");
  assert.equal(formatAge("2026-09-22T12:00:00.000Z", now), "2d");
});

test("Command is signals → work queue → approvals, with Pulse in the rail", () => {
  const command = read("src/components/ring1-command-center.tsx");
  assert.doesNotMatch(command, /workMode/);
  assert.doesNotMatch(command, /<OpsBriefing|<ProShiftTimeline|<ProCommandOutcomes/);
  const signalsIdx = command.indexOf("<CommandSignals");
  const queueIdx = command.indexOf("<AttentionQueue");
  const approveIdx = command.indexOf("<ApproveQueue");
  const pulseIdx = command.indexOf("<OrviusPulse");
  assert.ok(signalsIdx >= 0 && queueIdx > signalsIdx);
  assert.ok(approveIdx > queueIdx && pulseIdx > approveIdx);
  assert.match(command, /groupWorkItems/);
  assert.equal(existsSync(join(root, "src/components/ops-briefing.tsx")), false);

  const pulse = read("src/components/orvius-pulse.tsx");
  for (const row of ["Phone line", "Alert delivery", "Recent successful events"]) {
    assert.match(pulse, new RegExp(row));
  }
  assert.match(pulse, /formatFreshness/);
});

test("work queue rows show severity, customer, request, age, impact, one action", () => {
  const queue = read("src/components/attention-queue.tsx");
  assert.match(queue, /id="work-queue"/);
  assert.match(queue, /Orvius recommends/);
  assert.match(queue, /formatAge/);
  assert.match(queue, /at stake/);
  assert.match(queue, /No value estimate/);
  assert.match(queue, /<PrimaryAction/);
  assert.match(queue, /Queue is clear/);
});

test("ApproveQueue keeps an approval button and agent-control anchor", () => {
  const approve = read("src/components/approve-queue.tsx");
  assert.match(approve, /id="agent-control"/);
  assert.match(approve, /"Approve"/);
  assert.match(approve, /Needs your OK/);
});

test("one record drawer walks the Call → … → Payment graph", () => {
  assert.equal(isRecordType("job"), true);
  assert.equal(isRecordType("invoice"), false);
  assert.equal(recordHref("call", "c1"), "/dashboard/calls/c1");
  assert.equal(recordHref("lead", "l1"), "/dashboard/inbox/l1");

  const view = read("src/lib/record-view.ts");
  for (const node of ["Call", "Lead", "Customer", "Property", "Job", "Technician", "Estimate", "Payment"]) {
    assert.match(view, new RegExp(`"${node}"`));
  }
  assert.match(view, /businessId/);

  const route = read("src/app/api/records/[type]/[id]/route.ts");
  assert.match(route, /requireEntitledSession/);
  assert.match(route, /status: 404/);

  const drawer = read("src/components/record-drawer.tsx");
  for (const section of ["Relationship path", "Source", "Captured", "Event history", "Open full record"]) {
    assert.match(drawer, new RegExp(section));
  }
  assert.match(drawer, /Escape/);
  assert.match(read("src/app/dashboard/layout.tsx"), /RecordDrawerProvider/);
});
