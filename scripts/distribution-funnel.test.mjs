import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("call-audit requests enter a concrete paid-plan funnel", () => {
  const form = read("src/components/early-access-form.tsx");
  const route = read("src/app/api/waitlist/route.ts");

  assert.match(form, /plan: "pro"/);
  assert.match(form, /Audit request received/);
  assert.match(route, /plan: body\.plan \?\? "pro"/);
  assert.match(route, /existing\?\.status === "closed"/);
  assert.match(route, /status: "new", nextActionAt: null/);
});

test("prospect management fails closed to ordinary shop sessions", () => {
  const route = read("src/app/api/waitlist/route.ts");
  assert.match(route, /return isFounderEmail\(email\)/);
  assert.doesNotMatch(route, /allowed\.size === 0/);
});
