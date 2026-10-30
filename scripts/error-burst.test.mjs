#!/usr/bin/env node
/*
 * Production logs about one error every few days. A handful close together is
 * a break, and the founder's phone hears it from the five-minute drain instead
 * of someone finding it in Vercel's logs days later.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.ORVIUS_COUNT_ERRORS = "1";
process.env.RESEND_API_KEY = "re_test_key";
delete process.env.RESEND_FROM;
process.env.ORVIUS_FOUNDER_EMAILS = "founder@orvius.test";
delete process.env.ORVIUS_FOUNDER_PHONE;

const { prisma } = await import("../src/lib/prisma.ts");
const { countError, pageOnErrorBurst, recentErrors, ERROR_BURST_THRESHOLD } = await import("../src/lib/error-burst.ts");

test("errors close together page the founder once, with what broke; one stray error does not", async () => {
  const realFetch = globalThis.fetch;
  const emails = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.resend.com")) {
      emails.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: "e" }), { status: 200 });
    }
    return realFetch(url, init);
  };
  const now = new Date("2031-09-10T14:02:00Z");
  const clean = () =>
    Promise.all([
      prisma.webhookEvent.deleteMany({ where: { source: "orvius", eventType: "error-count", externalId: { startsWith: "2031-09-10" } } }),
      prisma.cronRun.deleteMany({ where: { name: "page:error_burst" } }),
    ]);
  await clean();
  try {
    await countError("call_ingest.lead_alert_failed", now);
    assert.deepEqual(await pageOnErrorBurst(now), { paged: false, total: 1 });
    assert.equal(emails.length, 0);

    await countError("call_ingest.lead_alert_failed", now);
    await countError("vapi.call_report_finish_failed", new Date(now.getTime() + 60_000));
    assert.deepEqual(await recentErrors(new Date(now.getTime() + 60_000)), [
      { event: "call_ingest.lead_alert_failed", count: 2 },
      { event: "vapi.call_report_finish_failed", count: 1 },
    ]);
    const paged = await pageOnErrorBurst(new Date(now.getTime() + 60_000));
    assert.equal(paged.paged, true);
    assert.equal(paged.total, ERROR_BURST_THRESHOLD);
    assert.equal(emails.length, 1);
    assert.match(emails[0].text, /3 errors in 10 minutes: call_ingest\.lead_alert_failed ×2, vapi\.call_report_finish_failed ×1/);

    const again = await pageOnErrorBurst(new Date(now.getTime() + 5 * 60_000));
    assert.equal(again.paged, false, "one page per quarter hour, not one per drain");
    assert.equal(emails.length, 1);
  } finally {
    globalThis.fetch = realFetch;
    await clean();
  }
});

test("every logged error is counted in production, and the five-minute drain checks the count", () => {
  assert.match(readFileSync("src/lib/logger.ts", "utf8"), /VERCEL_ENV === "production"[\s\S]*countError\(event\)/);
  assert.match(readFileSync("src/app/api/cron/alert-drain/route.ts", "utf8"), /pageOnErrorBurst\(\)/);
  assert.doesNotMatch(readFileSync("src/lib/error-burst.ts", "utf8"), /log(Error|Warn|Info)\(/, "counting runs inside logError and must not recurse");
});

test.after(() => prisma.$disconnect());
