#!/usr/bin/env node
/*
 * A screen opened a second time paints what it showed last time and then
 * refreshes. Failures are never remembered, old entries are never shown, and a
 * server render never reads or writes the cache it would share across shops.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cache = await import("../src/lib/screen-cache.ts");

const realFetch = globalThis.fetch;
let calls = [];
let reply = { status: 200, body: { jobs: [{ id: "j1" }] } };

test.beforeEach(() => {
  globalThis.window = {};
  cache.forgetScreens();
  calls = [];
  reply = { status: 200, body: { jobs: [{ id: "j1" }] } };
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  };
});
test.after(() => {
  globalThis.fetch = realFetch;
  delete globalThis.window;
});

test("a good reply is remembered and painted next time; a refusal is not", async () => {
  assert.equal(cache.cachedScreen("/api/jobs"), null);
  const { data } = await cache.loadScreen("/api/jobs");
  assert.deepEqual(data, { jobs: [{ id: "j1" }] });
  assert.equal(calls[0].init.cache, "no-store", "the refresh always asks the server");
  assert.deepEqual(cache.cachedScreen("/api/jobs"), { jobs: [{ id: "j1" }] });

  reply = { status: 401, body: { error: "Unauthorized" } };
  const refused = await cache.loadScreen("/api/calls?limit=100");
  assert.equal(refused.data, null);
  assert.equal(refused.res.status, 401);
  assert.equal(cache.cachedScreen("/api/calls?limit=100"), null);
});

test("entries older than ten minutes are not shown", () => {
  const start = 1_000_000;
  cache.rememberScreen("/api/work?view=open", { items: [] }, start);
  assert.deepEqual(cache.cachedScreen("/api/work?view=open", start + 9 * 60_000), { items: [] });
  assert.equal(cache.cachedScreen("/api/work?view=open", start + 11 * 60_000), null);
});

test("the cache is bounded; the oldest entry goes first", () => {
  for (let i = 0; i < 45; i++) cache.rememberScreen(`/api/x/${i}`, i);
  assert.equal(cache.cachedScreen("/api/x/0"), null);
  assert.equal(cache.cachedScreen("/api/x/44"), 44);
});

test("hovering a place warms its data once, not on every hover", async () => {
  cache.prefetchPlace("/dashboard/jobs");
  cache.prefetchPlace("/dashboard/jobs");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(calls.map((c) => c.url).sort(), ["/api/jobs", "/api/leads?limit=1"]);
  cache.prefetchPlace("/dashboard/jobs");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(calls.length, 2, "fresh data is not fetched again within 15s");
  cache.prefetchPlace("/dashboard/unknown");
  assert.equal(calls.length, 2);
});

test("a server render never reads or writes the cache", async () => {
  cache.rememberScreen("/api/jobs", { jobs: ["shop A"] });
  delete globalThis.window;
  assert.equal(cache.cachedScreen("/api/jobs"), null);
  cache.rememberScreen("/api/jobs", { jobs: ["shop B"] });
  cache.prefetchScreen("/api/calls?limit=100");
  assert.equal(calls.length, 0);
  globalThis.window = {};
  assert.deepEqual(cache.cachedScreen("/api/jobs"), { jobs: ["shop A"] });
});

test("the busiest screens paint from the cache and the sidebar warms them", () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  for (const page of ["jobs", "calls", "inbox", "work"]) {
    const source = read(`src/app/dashboard/${page}/page.tsx`);
    assert.match(source, /cachedScreen</, page);
    assert.match(source, /loadScreen</, page);
  }
  assert.match(read("src/components/os-shell.tsx"), /onMouseEnter=\{\(\) => prefetchPlace\(item\.href\)\}/);
});
