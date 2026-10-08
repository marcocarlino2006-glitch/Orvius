import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { describeRecordFailure, RecordFetchError, recordFailureFrom } from "../src/lib/dashboard-fetch.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("a missing record and a failed load are different problems", () => {
  const missing = describeRecordFailure("job", 404);
  assert.match(missing.title, /isn't on this account/);
  assert.equal(missing.retry, false);
  const broken = describeRecordFailure("job", 500);
  assert.match(broken.title, /couldn't load/);
  assert.equal(broken.retry, true);
  assert.match(broken.impact, /Nothing was changed/);
  assert.match(describeRecordFailure("call", null).cause, /connection dropped/);
  assert.equal(describeRecordFailure("customer", 401).href, "/signin");
  assert.equal(recordFailureFrom("job", new RecordFetchError(404)).retry, false);
  assert.equal(recordFailureFrom("job", new Error("boom")).retry, true);
});

test("every record page shows a recoverable failure, never a blank", () => {
  for (const page of ["jobs/[id]", "calls/[id]", "customers/[id]", "inbox/[id]"]) {
    const src = read(`src/app/dashboard/${page}/page.tsx`);
    assert.match(src, /RecordLoadFailure/, `${page} uses the shared failure state`);
    assert.match(src, /recordFailureFrom|RecordFetchError/, `${page} tells not-found from failed`);
  }
  const comp = read("src/components/record-load-failure.tsx");
  assert.match(comp, /Try again/);
  assert.match(comp, /backHref/);
});

test("the owner can take a text thread over and hand it back", () => {
  const page = read("src/app/dashboard/inbox/messages/page.tsx");
  assert.match(page, /msg-takeover/);
  assert.match(page, /Take over/);
  assert.match(page, /Hand back to Orvius/);
  assert.match(page, /\/api\/command\/takeover/);
  assert.match(read("src/lib/messages.ts"), /takenOver/);
});

test("switching shops tells the owner when it fails", () => {
  assert.match(read("src/components/os-sidebar-footer.tsx"), /toast/i);
});
