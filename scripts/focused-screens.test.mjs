#!/usr/bin/env node
/*
 * The call screen and Home show only what an owner can act on: the recording
 * fits its card, an empty fact is left out instead of explained, the
 * transcript has one frame, and every block on Home says what it is.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("the waveform is one drawing that scales to its track, under a transparent scrubber", () => {
  const player = read("src/components/call-player.tsx");
  assert.match(player, /<svg className="call-player-wave" viewBox=/);
  assert.match(player, /preserveAspectRatio="none"/);
  assert.doesNotMatch(player, /<span[\s\S]{0,80}call-player-bar/, "180 spans with a gap each overflow a narrow card");
  assert.match(read("src/app/dashboard/orvius.css"), /\.call-player \.call-player-scrub \{[\s\S]*?background: transparent !important/);
});

test("the call screen leaves out what it doesn't know and doesn't repeat itself", () => {
  const page = read("src/app/dashboard/calls/[id]/page.tsx");
  assert.doesNotMatch(page, /Not on this call's report/);
  assert.match(page, /<TranscriptCinema transcript=\{call\.transcript\} variant="void" bare \/>/);
  assert.match(page, /priorJobs\.slice\(0, 3\)/);
  assert.match(page, /earlier \{situation\.priorJobs\.length - 3 === 1 \? "visit" : "visits"\}/);
  assert.match(read("src/components/call-gallery-share.tsx"), /if \(!view\.shareable && !view\.status\) return null;/);
});

test("the work card under the latest call on Home is labeled", () => {
  assert.match(read("src/components/ring1-command-center.tsx"), /cmd-next-kicker">Needs you next</);
});

test("Home's composer is a field of its own; the shop's setup cards sit below it, not inside it", () => {
  const desk = read("src/components/ring1-command-center.tsx");
  assert.match(desk, /<AskBar onChange=\{\(\) => void refresh\(\)\} \/>\s*\{setup \? <div className="cmd-ask-setup">\{setup\}<\/div> : null\}/);
  assert.match(read("src/app/dashboard/orvius.css"), /\.cmd\.cmd-one \.cb-ask-form \{\s*border: 1px solid var\(--m-line-2\) !important;/);
});
