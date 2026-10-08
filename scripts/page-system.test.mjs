#!/usr/bin/env node
/*
 * The page system: Command is the control center and every other page holds
 * the records it acts on. These tests pin the derived states each page shows
 * so a label never claims more than the record says.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { jobLifecycle } from "../src/lib/job-lifecycle.ts";
import { inboxFacts } from "../src/lib/inbox-state.ts";
import { callOutcome } from "../src/lib/call-outcome.ts";
import { previewMove } from "../src/lib/schedule-move.ts";
import { aiAuthority } from "../src/lib/ai-authority.ts";
import { osProductNav } from "../src/lib/os-nav.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("jobs move through six states and are never called verified", () => {
  assert.equal(jobLifecycle({ status: "scheduled" }).state, "awaiting_confirmation");
  assert.equal(jobLifecycle({ status: "scheduled", customerConfirmedAt: new Date() }).state, "confirmed");
  assert.equal(jobLifecycle({ status: "confirmed", technician: { name: "Ana" } }).state, "assigned");
  assert.equal(jobLifecycle({ status: "en_route", technician: { name: "Ana" } }).state, "in_progress");
  assert.equal(jobLifecycle({ status: "completed" }).state, "completion_reported");
  assert.equal(jobLifecycle({ status: "completed", resolutionCode: "fixed" }).state, "closed");
  assert.equal(jobLifecycle({ status: "cancelled" }).state, "closed");
  for (const state of ["scheduled", "confirmed", "en_route", "completed", "cancelled"]) {
    const shown = jobLifecycle({ status: state, resolutionCode: "fixed", technician: { name: "Ana" } });
    assert.doesNotMatch(`${shown.label} ${shown.detail}`, /verified/i);
  }
});

const lead = (over = {}) => ({
  status: "new",
  name: "Dana",
  phone: "+15555550100",
  address: "1 Main St",
  serviceType: "AC repair",
  urgency: "normal",
  source: "call",
  createdAt: new Date("2026-10-01T15:00:00Z"),
  firstContactedAt: null,
  followUpSentAt: null,
  followUpRepliedAt: null,
  job: null,
  escalated: false,
  takenOver: false,
  lastMessage: null,
  ...over,
});

test("each request sits in exactly one inbox view, with what's missing named", () => {
  assert.equal(inboxFacts(lead()).view, "new");
  assert.equal(inboxFacts(lead({ status: "contacted" })).view, "waiting");
  assert.equal(inboxFacts(lead({ escalated: true })).view, "person");
  assert.equal(inboxFacts(lead({ takenOver: true })).view, "person");
  assert.equal(
    inboxFacts(lead({ status: "contacted", lastMessage: { direction: "in", createdAt: new Date(), readAt: null } })).view,
    "person",
  );
  assert.equal(inboxFacts(lead({ job: { id: "j1", status: "scheduled" } })).view, "resolved");
  assert.equal(inboxFacts(lead({ status: "lost" })).view, "resolved");
  assert.ok(inboxFacts(lead({ address: null })).missing.length > 0);
});

test("call outcomes: safety wins, transfers come from the end reason, short calls are incomplete", () => {
  const base = { status: "completed", booked: false, durationSec: 120, lead: { urgency: "normal" } };
  assert.equal(callOutcome({ ...base, booked: true }), "booked");
  assert.equal(callOutcome({ ...base, escalated: true, booked: true }), "safety");
  assert.equal(callOutcome({ ...base, lead: { urgency: "emergency" } }), "safety");
  assert.equal(callOutcome({ ...base, endedReason: "assistant-forwarded-call" }), "transferred");
  assert.equal(callOutcome({ ...base, durationSec: 5 }), "incomplete");
  assert.equal(callOutcome({ ...base, lead: null }), "incomplete");
  assert.equal(callOutcome(base), "held");
});

test("a schedule move is previewed with conflicts and who gets told, before anything saves", () => {
  const tech = (id, name, phone, blocks, extra = {}) => ({
    technician: { id, name, phone, skills: ["hvac"] },
    blocks,
    offAllDay: false,
    availability: null,
    ...extra,
  });
  const schedule = {
    window: { startMin: 420, endMin: 1080 },
    lanes: [
      tech("a", "Ana Ruiz", "+15555550101", [{ id: "j1", title: "AC tune-up", startMin: 540, endMin: 600, skill: "hvac" }]),
      tech("b", "Ben Cole", null, [{ id: "j2", title: "Furnace", startMin: 560, endMin: 620, skill: "hvac" }]),
    ],
    unassigned: [],
    conflicts: [],
  };
  const move = previewMove(schedule, "j1", "b");
  assert.ok(move);
  assert.equal(move.fromName, "Ana Ruiz");
  assert.equal(move.toName, "Ben Cole");
  assert.ok(move.conflicts.some((c) => c.includes("Overlaps Furnace")));
  assert.ok(move.notify.some((n) => n.includes("Ben has no mobile")));
  assert.ok(move.notify.some((n) => n.includes("Ana gets a text")));
  assert.ok(move.notify.some((n) => n.includes("customer isn't texted")));
  assert.equal(previewMove(schedule, "missing", "b"), null);
});

test("AI authority follows the shop's settings", () => {
  const book = aiAuthority({ bookingMode: "book", autopilot: true });
  assert.ok(book.automatic.some((l) => /Book callers/.test(l)));
  const alert = aiAuthority({ bookingMode: "alert", autopilot: false });
  assert.ok(!alert.automatic.some((l) => /Book callers/.test(l)));
  assert.ok(alert.approval.some((l) => /Every booking/.test(l)));
  assert.ok(alert.blocked.length > 0);
});

test("nav is Command, Inbox, Calls, Jobs, Schedule, Customers, Team — no Ask, no Dispatch", () => {
  const labels = osProductNav.map((i) => i.label);
  assert.deepEqual(labels, ["Command", "Inbox", "Calls", "Jobs", "Schedule", "Customers", "Team"]);
  assert.ok(!osProductNav.some((i) => i.href === "/dashboard/ask" || i.href === "/dashboard/dispatch"));
  assert.match(read("src/app/dashboard/dispatch/page.tsx"), /redirect\("\/dashboard\/schedule"\)/);
});

test("Command asks for work in one bar and shows propose → approve → result", () => {
  const board = read("src/components/command-board.tsx");
  assert.match(board, /Ask Orvius to book, move, assign, or check work\./);
  assert.match(board, /Proposed change/);
  assert.match(board, /Your approval/);
  const center = read("src/components/ring1-command-center.tsx");
  assert.match(center, /Action queue/);
  assert.match(center, /Recent actions/);
  assert.doesNotMatch(center, /revenue at risk/i);
});
