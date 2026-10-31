#!/usr/bin/env node
/*
 * A dropped job moves on the board the moment it is dropped. The guess keeps
 * the time, never invents a lane, and the screens put the board back exactly
 * when the server refuses.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { reassignOnBoard, moveOnWeek } = await import("../src/lib/schedule-optimistic.ts");

const block = (id, startMin, endMin = startMin + 60) => ({
  id,
  title: `Job ${id}`,
  status: "scheduled",
  urgency: null,
  customerName: "Dana",
  address: "1 Main St",
  startMin,
  endMin,
  skill: "general",
  conflict: null,
});
const lane = (id, blocks) => ({
  technician: { id, name: id, phone: null, skills: [] },
  blocks,
  bookedMin: blocks.reduce((n, b) => n + b.endMin - b.startMin, 0),
  availability: null,
  offAllDay: false,
});
const board = () => ({
  window: { startMin: 420, endMin: 1140 },
  lanes: [lane("ana", [block("j1", 540), block("j2", 720)]), lane("ben", [block("j3", 600, 690)])],
  unassigned: [
    { id: "u1", title: "Job u1", urgency: null, customerName: null, address: null, startMin: 480, endMin: 540, skill: "general", recommendation: null, blocked: null },
    { id: "u2", title: "No time", urgency: null, customerName: null, address: null, startMin: null, endMin: null, skill: "general", recommendation: null, blocked: null },
  ],
  conflicts: [],
});

test("a job moves to another technician at the same time, in time order, hours carried", () => {
  const before = board();
  const after = reassignOnBoard(before, "j1", "ben");
  assert.deepEqual(after.lanes[0].blocks.map((b) => b.id), ["j2"]);
  assert.deepEqual(after.lanes[1].blocks.map((b) => [b.id, b.startMin]), [["j1", 540], ["j3", 600]]);
  assert.equal(after.lanes[0].bookedMin, 60);
  assert.equal(after.lanes[1].bookedMin, 150);
  assert.deepEqual(before, board(), "the board it came from is untouched, so a refusal can put it back");
});

test("unassigned and back", () => {
  const off = reassignOnBoard(board(), "j2", null);
  assert.ok(off.unassigned.some((u) => u.id === "j2" && u.startMin === 720));
  const on = reassignOnBoard(board(), "u1", "ana");
  assert.deepEqual(on.lanes[0].blocks.map((b) => b.id), ["u1", "j1", "j2"]);
  assert.ok(!on.unassigned.some((u) => u.id === "u1"));
});

test("no guess when there is nothing honest to show", () => {
  assert.equal(reassignOnBoard(board(), "j1", "ana"), null, "same lane");
  assert.equal(reassignOnBoard(board(), "j1", "nobody"), null, "unknown lane");
  assert.equal(reassignOnBoard(board(), "missing", "ben"), null, "unknown job");
  assert.equal(reassignOnBoard(board(), "u2", "ben"), null, "a job with no time has no place on the axis");
});

test("the week moves a job across days and people, keeping its time", () => {
  const week = [
    { day: "2026-11-02", schedule: board() },
    { day: "2026-11-03", schedule: { ...board(), lanes: [lane("ana", []), lane("ben", [])], unassigned: [] } },
  ];
  const moved = moveOnWeek(week, "j1", "ben", "2026-11-03");
  assert.deepEqual(moved[0].schedule.lanes[0].blocks.map((b) => b.id), ["j2"]);
  assert.deepEqual(moved[1].schedule.lanes[1].blocks.map((b) => [b.id, b.startMin]), [["j1", 540]]);
  assert.equal(moveOnWeek(week, "j1", "ben", "2026-12-25"), null, "a day off the week isn't guessed");
  assert.equal(moveOnWeek(week, "j1", "nobody", "2026-11-03"), null);
});

test("the day board, the week and the inbox move first and put things back on a refusal", () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const day = read("src/app/dashboard/schedule/page.tsx");
  assert.match(day, /reassignOnBoard\(before\.schedule, jobId, technicianId\)/);
  assert.match(day, /catch \{\s*if \(before && moved\) setBoard\(before\);/);
  const week = read("src/components/dispatch-week.tsx");
  assert.match(week, /moveOnWeek\(before\.days, d\.jobId, laneId, day\)/);
  assert.match(week, /catch \{\s*if \(before && days\) setWeek\(before\);/);
  const inbox = read("src/app/dashboard/inbox/page.tsx");
  assert.match(inbox, /const restore = onClosed\(lead\);/);
  assert.match(inbox, /catch \{\s*restore\(\);/);
});
