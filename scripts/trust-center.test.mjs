import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const root = new URL("../", import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), "utf8");

function routes(dir = join(root, "src/app/api")) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routes(full);
    return name === "route.ts" ? [relative(root, full)] : [];
  });
}

const SESSION = /requirePermission|requireEntitledSession|requireBusinessSession|withOffice\(|requireAdmin\(|await auth\(\)/;
const ADMIN = /isPrivilegedRequest|verifyAdminRequest/;
const TECH = /withTech\(/;
const SIGNED = /x-twilio-signature|verifyVapiWebhookSecret|verifyJobberWebhook|voiceSimSecretMatches|constructEvent|CRON_SECRET/;
/* Reachable without a session on purpose: sign-in itself, customer links carrying their own token, and the public site. */
const PUBLIC = [
  "src/app/api/auth/",
  "src/app/api/public/",
  "src/app/api/public-demo/",
  "src/app/api/preview/",
  "src/app/api/status/",
  "src/app/api/health/",
];

test("every API route is guarded, or is public on purpose", () => {
  const all = routes();
  assert.ok(all.length > 100, "found the routes");
  const unguarded = all.filter((p) => {
    if (PUBLIC.some((prefix) => p.startsWith(prefix))) return false;
    const src = read(p);
    return !(SESSION.test(src) || ADMIN.test(src) || TECH.test(src) || SIGNED.test(src));
  });
  assert.deepEqual(unguarded, [], "a new route must check who is asking");
});

test("a signed-in route that opens one record by id scopes it to the caller's shop", () => {
  const leaks = routes()
    .filter((p) => /\[(id|photoId|jobId)\]/.test(p))
    .filter((p) => SESSION.test(read(p)))
    .filter((p) => !/businessId|business\.id|belongsToBusiness/.test(read(p)));
  assert.deepEqual(leaks, []);
});

test("roles grant exactly what the help center says", async () => {
  const { can } = await import("../src/lib/workspace-access-labels.ts");
  for (const p of ["billing.manage", "workspace.delete", "ownership.transfer"]) {
    assert.equal(can("owner", p), true);
    assert.equal(can("manager", p), false, `manager must not ${p}`);
    assert.equal(can("dispatcher", p), false);
  }
  for (const p of ["settings.edit", "team.manage", "data.export", "audit.view"]) {
    assert.equal(can("manager", p), true);
    assert.equal(can("dispatcher", p), false, `dispatcher must not ${p}`);
  }
  assert.match(read("src/app/api/billing/portal/route.ts"), /requirePermission\("billing\.manage"/);
  assert.match(read("src/app/api/account/export/route.ts"), /requirePermission\("data\.export", \{ entitled: false \}\)/);
});

test("stored credentials are sealed and every provider webhook is signed", () => {
  const jobber = read("src/lib/jobber.ts");
  assert.match(jobber, /accessTokenEnc: sealSecret\(/);
  assert.match(jobber, /refreshTokenEnc: tokens\.refresh_token \? sealSecret\(/);
  assert.doesNotMatch(read("prisma/schema.prisma"), /^\s+(accessToken|refreshToken|apiKey|password)\s+String/m);
  for (const p of ["src/app/api/webhooks/twilio/sms/route.ts", "src/app/api/webhooks/twilio/status/route.ts", "src/app/api/webhooks/twilio/voice-fallback/route.ts"]) {
    assert.match(read(p), /x-twilio-signature/, p);
  }
  assert.match(read("src/app/api/webhooks/vapi/route.ts"), /verifyVapiWebhookSecret/);
  assert.match(read("src/app/api/webhooks/jobber/route.ts"), /verifyJobberWebhook/);
  assert.match(read("src/app/api/billing/webhook/route.ts"), /constructEvent/);
});

test("published retention is the retention that runs", async () => {
  const limits = await import("../src/lib/usage-limits.ts");
  assert.match(read("src/lib/retention.ts"), /from "@\/lib\/usage-limits"/);
  assert.match(read("src/app/privacy/page.tsx"), /deleted \{CALL_CONTENT_RETENTION_MONTHS\} months/);
  for (const p of ["src/app/security/page.tsx", "src/lib/help-center.tsx"]) {
    const src = read(p);
    assert.match(src, /CALL_CONTENT_RETENTION_MONTHS/, p);
    assert.match(src, /OWNER_NOTIFICATION_RETENTION_DAYS/, p);
  }
});

test("every call carries the recording notice", async () => {
  const { openingWithNotice } = await import("../src/lib/vapi.ts");
  assert.match(openingWithNotice("Thanks for calling Ace Air.", "Ace Air"), /may be recorded and is answered by an automated receptionist/);
  assert.match(openingWithNotice("", "Ace Air"), /may be recorded/);
});

test("support, incidents and leaving each have a page an owner can find", () => {
  const help = read("src/lib/help-center.tsx");
  for (const slug of ["your-data", "leaving-orvius", "when-something-breaks", "troubleshooting"]) {
    assert.match(help, new RegExp(`slug: "${slug}"`), slug);
  }
  const security = read("src/app/security/page.tsx");
  assert.match(security, /title="7\. Incidents"/);
  assert.match(security, /title="8\. Leaving"/);
  assert.match(security, /\/help\/leaving-orvius/);
  assert.match(security, /href="\/status"/);
  assert.doesNotMatch(security, /Approve-before-send patterns/);
});
