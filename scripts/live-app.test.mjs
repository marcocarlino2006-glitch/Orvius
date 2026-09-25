#!/usr/bin/env node
/*
 * Orvius as an app the owner lives in: it updates itself, it can sit on the
 * home screen and tap them on the shoulder, and it can be driven from the
 * keyboard without ever firing while they type.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { GO_TO, SHORTCUT_GROUPS, goToHref, isTypingTarget } from "../src/lib/keyboard-shortcuts.ts";
import { pushFromAlert } from "../src/lib/web-push.ts";
import manifest from "../src/app/manifest.ts";

test("g-then-letter jumps to every main screen, and never fires while typing", () => {
  assert.equal(goToHref("c"), "/dashboard");
  assert.equal(goToHref("D"), "/dashboard/dispatch");
  assert.equal(goToHref("z"), null);
  assert.equal(new Set(GO_TO.map((g) => g.key)).size, GO_TO.length, "no two screens share a key");
  assert.ok(SHORTCUT_GROUPS.flatMap((g) => g.items).some((i) => i.keys.includes("?")));
  assert.equal(isTypingTarget({ tagName: "INPUT" }), true);
  assert.equal(isTypingTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(isTypingTarget({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isTypingTarget({ tagName: "BUTTON", isContentEditable: false }), false);
  assert.equal(isTypingTarget(null), false);
});

test("a push reads like the owner's text, and safety calls stay on screen", () => {
  const push = pushFromAlert("Summit Heating", "New lead: Maria Lopez · no heat\n+1 312 555 0199 · 12 Oak St\nBooked Mon 9 AM", "lead_1");
  assert.equal(push.title, "Summit Heating");
  assert.equal(push.body, "New lead: Maria Lopez · no heat · +1 312 555 0199 · 12 Oak St");
  assert.equal(push.url, "/dashboard/inbox/lead_1");
  assert.equal(push.tag, "lead-lead_1");
  assert.equal(push.urgent, false);

  const safety = pushFromAlert("Summit Heating", "SAFETY — gas smell. Priya at 915 Hinman.");
  assert.equal(safety.title, "Urgent · Summit Heating");
  assert.equal(safety.urgent, true);
  assert.equal(safety.url, "/dashboard");
  assert.ok(safety.body.length <= 180);
});

test("Orvius installs to the home screen and opens on Command", () => {
  const m = manifest();
  assert.equal(m.display, "standalone");
  assert.equal(m.start_url, "/dashboard");
  assert.ok(m.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"));
  assert.ok(m.icons.some((i) => i.sizes === "192x192"));
});

test("the service worker shows pushes and opens the right screen, without caching job data", () => {
  const sw = readFileSync("public/sw.js", "utf8");
  assert.match(sw, /addEventListener\("push"/);
  assert.match(sw, /notificationclick/);
  assert.doesNotMatch(sw, /caches\.open|addEventListener\("fetch"/);
});

test("Command listens for changes instead of waiting for the next poll", () => {
  const ctx = readFileSync("src/lib/ring1-context.tsx", "utf8");
  assert.match(ctx, /new EventSource\("\/api\/ring1\/stream"\)/);
  assert.match(ctx, /closeStream\(\)/, "a hidden tab drops its stream");
  const stream = readFileSync("src/app/api/ring1/stream/route.ts", "utf8");
  assert.match(stream, /requireEntitledSession\(\)/);
  assert.match(stream, /text\/event-stream/);
});
