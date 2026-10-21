import assert from "node:assert/strict";
import test from "node:test";
import { commandSentence } from "../src/lib/command-sentence.ts";

const clear = { loaded: true, brief: null, live: null, approval: null, item: null, lastSummary: null };

test("a decision names itself, ahead of any tally", () => {
  assert.equal(
    commandSentence({
      ...clear,
      brief: "Today: 0 jobs booked, 0 completed.",
      item: { title: "AC not cooling", customer: "Maria Lopez", nextAction: "Call Maria Lopez back now — emergency" },
    }),
    "Call Maria Lopez back now.",
  );
  assert.equal(
    commandSentence({
      ...clear,
      brief: "Today: 5 jobs booked, 4 completed.",
      approval: { title: "Book Pam Thursday at 1", needsCheck: false },
      item: { title: "AC not cooling", customer: "Maria Lopez", nextAction: "Call Maria Lopez" },
    }),
    "Book Pam Thursday at 1.",
  );
  assert.equal(
    commandSentence({ ...clear, approval: { title: "The visit may not have happened", needsCheck: true } }),
    "Check this. The visit may not have happened.",
  );
});

test("with nobody waiting, a real day stands and a zero day does not", () => {
  assert.equal(commandSentence({ ...clear, brief: "Today: 5 jobs booked, 4 completed." }), "Today: 5 jobs booked, 4 completed.");
  assert.equal(commandSentence({ ...clear, brief: "Today: 0 jobs booked, 0 completed." }), "The line is clear.");
  assert.equal(commandSentence({ ...clear, brief: "Nothing on the board yet today." }), "The line is clear.");
  assert.equal(commandSentence({ ...clear, brief: "No jobs on the board today." }), "The line is clear.");
  assert.equal(commandSentence({ ...clear, brief: "Quiet since you looked 3 hours ago — nothing needs you." }), "Quiet since you looked 3 hours ago — nothing needs you.");
});

test("a live call leads, ahead of the decision waiting", () => {
  assert.equal(
    commandSentence({
      ...clear,
      live: { who: "Maria Lopez" },
      approval: { title: "Book Pam Thursday at 1", needsCheck: false },
      item: { title: "AC not cooling", customer: "Maria Lopez", nextAction: "Call Maria Lopez back now" },
    }),
    "Maria Lopez is on the line.",
  );
  assert.equal(commandSentence({ ...clear, live: { who: "  " } }), "The line is clear.");
});

test("the last thing that happened speaks when nothing is waiting", () => {
  assert.equal(commandSentence({ ...clear, lastSummary: "Booked Dana Cole for Thursday" }), "Booked Dana Cole for Thursday.");
  assert.equal(commandSentence({ ...clear, loaded: false, brief: "Today: 5 jobs booked, 4 completed." }), "Reading the shop…");
});

test("a visit that does not need you is the day, and money still speaks", () => {
  assert.equal(
    commandSentence({
      ...clear,
      item: { title: "Water heater", customer: "Dana", nextAction: "Waiting on Ray to accept", needsYou: false, when: "Oct 23, 10:00 AM", tech: "Ray" },
    }),
    "Oct 23, 10:00 AM. Water heater. Ray.",
  );
  assert.equal(
    commandSentence({
      ...clear,
      item: { title: "Water heater", customer: "Dana", nextAction: "Waiting on Dana to pay $1", needsYou: false, when: "Oct 23, 10:00 AM", tech: "Ray" },
    }),
    "Waiting on Dana to pay $1.",
  );
  assert.equal(
    commandSentence({
      ...clear,
      item: { title: "Water heater", customer: "Dana", nextAction: "Assign a technician", needsYou: true, when: "Oct 23, 10:00 AM", tech: null },
    }),
    "Assign a technician.",
  );
});

test("a Spanish call is said in the sentence", () => {
  assert.equal(
    commandSentence({
      ...clear,
      item: { title: "No water", customer: "Maria", nextAction: "Call Maria back", needsYou: true, spanish: true },
    }),
    "Call Maria back. They called in Spanish.",
  );
});

test("a shop with no line hears that one next step when the day is empty", () => {
  assert.equal(commandSentence({ ...clear, lineOff: true }), "Connect the line. Orvius answers once it is on.");
  assert.equal(commandSentence({ ...clear, lineOff: true, brief: "Today: 0 jobs booked, 0 completed." }), "Connect the line. Orvius answers once it is on.");
  assert.equal(commandSentence({ ...clear, lineOff: true, brief: "Today: 5 jobs booked, 4 completed." }), "Today: 5 jobs booked, 4 completed.");
  assert.equal(
    commandSentence({ ...clear, lineOff: true, item: { title: "AC not cooling", customer: "Maria", nextAction: "Call Maria back", needsYou: true } }),
    "Call Maria back.",
  );
});
