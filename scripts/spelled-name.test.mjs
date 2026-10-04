import assert from "node:assert/strict";
import test from "node:test";

const { spelledRuns, callerLines, applySpelledRuns, withCallerSpelling } = await import("../src/lib/spelled-name.ts");

const realCall = [
  "AI: Could you please provide your full service address your name, and a callback number?",
  "User: Sure. My address is 8 30 Noise Street. Evanston 6 0 2 0 1. My name is Shivan Nguyen. That's spelled s I o b h a n n g u y e n. My callback number is 3 1 2 5 5 5 0 1 4 7.",
  "AI: Thank you, Shivana Guyan. I have your name as S I O B H A N.",
  "User: Yes. That's correct.",
].join("\n");

test("finds letter-by-letter runs only in what the caller said", () => {
  assert.deepEqual(spelledRuns(callerLines(realCall)).map((r) => r.letters), ["siobhannguyen"]);
  assert.deepEqual(spelledRuns("It's N-G-U-Y-E-N. First name Anne, spelled a, double n, e").map((r) => r.letters), ["nguyen", "anne"]);
  assert.deepEqual(spelledRuns("I think a new unit is a good idea"), []);
  assert.deepEqual(spelledRuns(callerLines(realCall))[0].before.slice(-4), ["Shivan", "Nguyen", "That's", "spelled"]);
});

test("rebuilds the name from the caller's spelling (real call from Sep 26)", () => {
  assert.deepEqual(withCallerSpelling({ name: "Shivan Nguyen", address: "830 Noise Street, Evanston 60201" }, realCall), {
    name: "Siobhan Nguyen",
    address: "830 Noise Street, Evanston 60201",
  });
  assert.equal(withCallerSpelling({ name: "Shavaughn Aguiyan" }, realCall).name, "Siobhan Nguyen");
  assert.equal(withCallerSpelling({ name: "Shivana Guyan" }, realCall).name, "Siobhan Nguyen");
  assert.equal(withCallerSpelling({ name: "Siobhan Nguyen" }, realCall).name, "Siobhan Nguyen");
});

test("a spelled last name or street fixes just that word", () => {
  const t = "User: My name is Mike Nuyen, that's N G U Y E N.\nUser: The street is Noise, N O Y E S.";
  assert.deepEqual(withCallerSpelling({ name: "Mike Nuyen", address: "830 Noise Street" }, t), {
    name: "Mike Nguyen",
    address: "830 Noyes Street",
  });
});

test("spellings that match nothing change nothing", () => {
  const t = "User: My email is j o h n at gmail. The code is x k c d.";
  assert.equal(applySpelledRuns("Maria Lopez", spelledRuns(callerLines(t))).text, "Maria Lopez");
  assert.equal(withCallerSpelling({ name: "Maria Lopez" }, null).name, "Maria Lopez");
  assert.equal(withCallerSpelling({ name: null }, realCall).name, null);
});

test("a silent first letter does not move the cut (voice sim, Sep 26)", () => {
  const t = [
    "AI: May I have your full name, please?",
    "User: Sure. It's Siobhan Guyen. That's s I o b h a n n g u y e n.",
  ].join("\n");
  assert.equal(withCallerSpelling({ name: "Siobhan Guyen" }, t).name, "Siobhan Nguyen");
  assert.equal(withCallerSpelling({ name: "Tom Night" }, "User: Tom Night, that's t o m k n i g h t.").name, "Tom Knight");
});
