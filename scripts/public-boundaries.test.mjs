/*
 * Public launch surfaces may advertise availability, but they must not reveal
 * tenant counts, webhook wiring, or the names of missing production secrets.
 * Runtime production probes provide the strongest check; these source-level
 * contracts keep the same boundary in CI without requiring deployed secrets.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("production health publishes readiness but keeps operational detail privileged", () => {
  const source = read("src/app/api/health/route.ts");
  const publicGuard = source.indexOf(
    "if (isProduction() && !(await isPrivilegedRequest(request)))",
  );
  const detailedResponse = source.indexOf('version: "1.0.0"');

  assert.ok(publicGuard >= 0, "production must distinguish anonymous callers");
  assert.ok(
    detailedResponse > publicGuard,
    "the detailed response must remain behind the production guard",
  );

  const publicResponse = source.slice(publicGuard, source.indexOf("\n  }\n", publicGuard));
  assert.ok(
    source.indexOf("prisma.") > publicGuard,
    "anonymous health checks must answer before any database round trip",
  );
  assert.doesNotMatch(publicResponse, /\bstats\b/);
  assert.doesNotMatch(publicResponse, /\bauth\b\s*:/);
  assert.doesNotMatch(publicResponse, /\bconfig\b\s*:/);
});

test("deployment wiring requires both an entitled session and founder identity", () => {
  const source = read("src/app/api/domains/route.ts");
  const entitled = source.indexOf("await requireEntitledSession()");
  const founder = source.indexOf("isFounderEmail(auth.email)");
  const payload = source.indexOf("buildDnsRecords(deployTarget)");

  assert.ok(entitled >= 0, "DNS setup must require an authenticated tenant");
  assert.ok(founder > entitled, "DNS setup must additionally require the founder");
  assert.ok(payload > founder, "deployment details must be built only after both checks");
});

test("anonymous checkout exposes availability without secret diagnostics", () => {
  const source = read("src/app/api/billing/checkout/route.ts");
  const getHandler = source.slice(source.indexOf("export async function GET"));

  assert.match(getHandler, /await isPrivilegedRequest\(request\)/);
  assert.match(
    getHandler,
    /\? \{ readiness: getBillingReadiness\(\) \}\s*:\s*\{\}/,
  );
  assert.doesNotMatch(
    getHandler.slice(0, getHandler.indexOf("await isPrivilegedRequest(request)")),
    /readiness:\s*getBillingReadiness\(\)/,
  );
});

