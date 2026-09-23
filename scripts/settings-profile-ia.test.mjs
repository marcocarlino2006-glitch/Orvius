import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("owner Settings has no founder Manus/Resend/cert instruments", () => {
  const settings = read("src/app/dashboard/settings/page.tsx");
  assert.doesNotMatch(settings, /FounderManusNext/);
  assert.doesNotMatch(settings, /founderCertJson/);
  assert.doesNotMatch(settings, /email-failover/);
  assert.doesNotMatch(settings, /Manus post/);
  assert.match(settings, /Call capture/);
  assert.match(settings, /Owner alerts/);
});

test("Profile is editable shop identity", () => {
  const profile = read("src/app/dashboard/profile/page.tsx");
  assert.match(profile, /Shop name/);
  assert.match(profile, /Save profile/);
  assert.match(profile, /timezone/);
  assert.match(profile, /method: "PATCH"/);
});

test("Founder ops plane owns cert Resend and Manus", () => {
  const ops = read("src/app/admin/ops/page.tsx");
  assert.match(ops, /FounderManusNext/);
  assert.match(ops, /founderCertJson/);
  assert.match(ops, /email-failover/);
  assert.match(ops, /Phone certification/);
});

test("Post-lock strip stays off owner Settings", () => {
  const banner = read("src/components/post-lock-banner.tsx");
  assert.doesNotMatch(banner, /dashboard\/settings/);
  assert.match(banner, /admin\/ops/);
  assert.match(banner, /dashboard\/billing/);
});
