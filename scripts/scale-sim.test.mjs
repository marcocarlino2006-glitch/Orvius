import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { rng, techOverlaps } from "./scale-sim.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the simulator replays the same population from the same seed", () => {
  const a = rng(7);
  const b = rng(7);
  const seq = (r) => Array.from({ length: 5 }, () => r());
  assert.deepEqual(seq(a), seq(b));
  assert.notDeepEqual(seq(rng(7)), seq(rng(8)));
});

test("a technician booked into overlapping times is caught; back-to-back is fine", () => {
  const at = (h) => new Date(Date.UTC(2026, 9, 6, h));
  assert.deepEqual(
    techOverlaps([
      { id: "a", technicianId: "t1", scheduledAt: at(9), durationMin: 60 },
      { id: "b", technicianId: "t1", scheduledAt: at(10), durationMin: 60 },
      { id: "c", technicianId: "t2", scheduledAt: at(9), durationMin: 60 },
    ]),
    [],
  );
  assert.equal(
    techOverlaps([
      { id: "a", technicianId: "t1", scheduledAt: at(9), durationMin: 120 },
      { id: "b", technicianId: "t1", scheduledAt: at(10), durationMin: 60 },
    ]).length,
    1,
  );
});

test("a time Orvius picked that keeps filling is not reported as the caller's held time", () => {
  const auto = read("src/lib/auto-job.ts");
  assert.match(auto, /error instanceof SlotTakenError && !held\)[\s\S]{0,300}skipReason: "capacity_unavailable"/);
  assert.match(read("src/lib/job.ts"), /attempt >= AUTO_PICK_ATTEMPTS - 1/);
});

test("a robocall or wrong number with an empty summary is noise, read from what the caller said", async () => {
  const { deriveDemandSignal } = await import("../src/lib/demand-capture.ts");
  const noise = (callerWords, over = {}) => deriveDemandSignal({ serviceType: null, summary: "Not a customer.", callerWords, trade: "HVAC", ...over }).categoryCode;
  assert.equal(noise("This is an important message about your business line of credit. Press one to speak with a funding specialist."), "other.non_service");
  assert.equal(noise("Is this Dr. Patel's dental office? Oh sorry, wrong number."), "other.non_service");
  assert.equal(deriveDemandSignal({ serviceType: "Business funding offer", trade: "HVAC" }).categoryCode, "other.non_service");
  // A caller who gave an address is a real request, whatever else they said.
  assert.equal(noise("Wrong number earlier, sorry. My AC is out at 12 Oak Ave.", { address: "12 Oak Ave, Springfield 22301" }), null);
  // Only noise is read from speech; a real request is never thrown out on it.
  assert.notEqual(noise("My furnace is blowing cold air."), "other.non_service");
});

test("someone trapped under a garage door goes to the owner as safety, not the calendar", async () => {
  const { classifyRequest } = await import("../src/lib/trade-playbooks.ts");
  const shop = { trade: "Garage doors" };
  const heard = (callerWords) => classifyRequest({ business: shop, serviceType: "Garage door won't open", callerWords }).safety?.key ?? null;
  assert.equal(heard("The garage door fell on my car and someone is trapped."), "door_injury");
  assert.equal(heard("My son is pinned under the garage door!"), "door_injury");
  assert.equal(heard("The door came down on my dad."), "door_injury");
  assert.equal(heard("My car is trapped inside, the door won't open."), null);
});

test("water reaching the electrical panel is a safety call, a plain leak is not", async () => {
  const { classifyRequest } = await import("../src/lib/trade-playbooks.ts");
  const heard = (callerWords) => classifyRequest({ business: { trade: "Plumbing" }, serviceType: "Leak", callerWords }).safety?.key ?? null;
  assert.equal(heard("Water is pouring onto the electrical panel."), "water_on_electrical");
  assert.equal(heard("The basement is flooding and the breaker box is wet."), "water_on_electrical");
  assert.equal(heard("The kitchen sink is leaking under the cabinet."), null);
});
