#!/usr/bin/env node
/*
 * Every response forbids framing (clickjacking), MIME sniffing, leaking full
 * URLs in the Referer header, and device APIs the app never uses.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("next.config sends the security headers on every path", () => {
  const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.match(config, /source: "\/:path\*"/);
  assert.match(config, /"X-Content-Type-Options", value: "nosniff"/);
  assert.match(config, /"X-Frame-Options", value: "DENY"/);
  assert.match(config, /frame-ancestors 'none'/);
  assert.match(config, /"Referrer-Policy", value: "strict-origin-when-cross-origin"/);
  assert.match(config, /camera=\(\), microphone=\(\), geolocation=\(\)/);
});
