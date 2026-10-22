import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { inboxBrief, jobsBrief } from "../src/lib/list-brief.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("jobs say what is open and the next move", () => {
  assert.equal(jobsBrief({ open: 0, needsYou: 0, unassigned: 0, today: 0 }), "Nothing is open. A call Orvius books shows up here.");
  assert.equal(
    jobsBrief({ open: 4, needsYou: 2, unassigned: 1, today: 1 }),
    "4 jobs are open. 2 need you, 1 has no technician, 1 is today. Assign the open ones on the schedule.",
  );
  assert.equal(jobsBrief({ open: 3, needsYou: 1, unassigned: 0, today: 0 }), "3 jobs are open. 1 needs you. Start with the ones that need you.");
  assert.equal(jobsBrief({ open: 2, needsYou: 0, unassigned: 0, today: 0 }), "2 jobs are open. None of them need you.");
});

test("inbox says who is waiting and what to do", () => {
  assert.equal(inboxBrief(null), "Requests that have not become a job yet.");
  assert.equal(inboxBrief({ new: 0, waiting: 0, person: 2 }), "2 requests need a person. Call them before booking the rest.");
  assert.equal(inboxBrief({ new: 1, waiting: 4, person: 0 }), "1 new request is ready. Book the ones that have an address and a problem.");
  assert.equal(inboxBrief({ new: 0, waiting: 1, person: 0 }), "1 request is waiting on the customer. Nothing to do until they reply.");
  assert.match(inboxBrief({ new: 0, waiting: 0, person: 0 }), /Nothing is waiting/);
});

test("a phone reaches Calls, Work and Ask from search, and owed money opens the report", () => {
  const palette = read("src/components/os-command-palette.tsx");
  assert.ok(palette.indexOf("osMoreNav") < palette.indexOf("osProductNav"), "Calls, Work and Ask lead the places");
  assert.match(palette, /What callers said/);
  assert.match(read("src/components/desk-board.tsx"), /Open the report/);
  assert.match(read("src/app/dashboard/jobs/page.tsx"), /jobsBrief/);
  assert.match(read("src/app/dashboard/inbox/page.tsx"), /inboxBrief/);
});
