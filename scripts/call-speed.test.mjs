#!/usr/bin/env node
/*
 * The caller's webhook waits on every database round trip, and on Turso each
 * one is a network hop. These pin the pieces that let independent work
 * overlap without changing what gets written or in what order.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { afterResponse } from "../src/lib/after-response.ts";

test("afterResponse runs inline outside a request, and never throws", async () => {
  let ran = false;
  await afterResponse(async () => {
    ran = true;
  });
  assert.equal(ran, true);
  await afterResponse(async () => {
    throw new Error("push service down");
  });
});

test("the audit queue writes in the order decisions were made, even when an earlier write is slow", async () => {
  const src = readFileSync("src/lib/audit.ts", "utf8");
  assert.match(src, /export function createAuditQueue/);
  assert.match(src, /tail = tail\.then\(\(\) => recordAudit\(input\)\)/);

  let tail = Promise.resolve();
  const written = [];
  const write = (name, ms) => new Promise((r) => setTimeout(() => (written.push(name), r()), ms));
  for (const [name, ms] of [["answered", 30], ["captured", 1], ["customer", 10]]) tail = tail.then(() => write(name, ms));
  await tail;
  assert.deepEqual(written, ["answered", "captured", "customer"]);
});

test("the call pipeline queues its audit trail and flushes it before finishing", () => {
  const ingest = readFileSync("src/lib/call-ingest.ts", "utf8");
  assert.doesNotMatch(ingest, /await recordAudit\(/, "no audit write blocks the call pipeline");
  assert.match(ingest, /maybeAutoBookLead\(lead\.id, \{ audit \}\)/);
  assert.match(ingest, /audit\.flush\(\)/);
  assert.match(ingest, /Release the claim now/);
});

test("public copy describes the transfer the receptionist actually does: only with a transfer number, callback otherwise", () => {
  const company = readFileSync("src/lib/company.ts", "utf8");
  assert.doesNotMatch(company, /no live transfer/i);
  assert.match(company, /transferred to the owner's phone when a transfer number is set/);
  assert.match(company, /callback/);
});

test("booking flushes its decisions before booking, and defers only work that could never fail it", () => {
  const autoJob = readFileSync("src/lib/auto-job.ts", "utf8");
  assert.match(autoJob, /await options\.audit\?\.flush\(\);\s*let job;/);
  assert.doesNotMatch(autoJob, /include:\s*\{\s*job:/, "lead relations load in parallel, not as chained includes");

  const job = readFileSync("src/lib/job.ts", "utf8");
  assert.match(job, /await audit\.flush\(\);\s*const bookedJobId/);
  assert.match(job, /afterResponse\(async \(\) => \{\s*await closeBookingMoneyLoop/);
  assert.match(job, /afterResponse\(async \(\) => \{\s*try \{\s*await notifyTechOnAssign/);

  const queue = readFileSync("src/lib/notification-queue.ts", "utf8");
  assert.match(queue, /afterResponse\(\(\) =>\s*sendOwnerPush/);
});
