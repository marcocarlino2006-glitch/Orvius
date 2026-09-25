/*
 * Turso round trips: the libsql adapter must not run a request's parallel
 * queries one at a time, and must still give a transaction the connection
 * to itself.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ConcurrentPrismaLibSql, ReadWriteLock } from "../src/lib/prisma-libsql-concurrent.ts";

const DELAY_MS = 40;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fakeClient(log) {
  let active = 0;
  const result = { columns: ["n"], columnTypes: ["INTEGER"], rows: [[1]], rowsAffected: 0 };
  const run = async (label) => {
    active += 1;
    log.maxActive = Math.max(log.maxActive, active);
    log.events.push(`start:${label}`);
    await sleep(DELAY_MS);
    log.events.push(`end:${label}`);
    active -= 1;
    return result;
  };
  return {
    execute: ({ sql }) => run(sql),
    executeMultiple: () => run("script"),
    transaction: async () => ({
      execute: ({ sql }) => run(`tx:${sql}`),
      commit: async () => log.events.push("commit"),
      rollback: async () => log.events.push("rollback"),
      close: () => {},
    }),
    close: () => {},
  };
}

class FakeFactory extends ConcurrentPrismaLibSql {
  constructor(log) {
    super({ url: "libsql://fake.turso.io", authToken: "x" });
    this.log = log;
  }
  createClient() {
    return fakeClient(this.log);
  }
}

const query = (sql) => ({ sql, args: [], argTypes: [] });

test("parallel queries run concurrently instead of one round trip at a time", async () => {
  const log = { maxActive: 0, events: [] };
  const adapter = await new FakeFactory(log).connect();
  const started = Date.now();
  await Promise.all(Array.from({ length: 10 }, (_, i) => adapter.queryRaw(query(`q${i}`))));
  const elapsed = Date.now() - started;
  assert.equal(log.maxActive, 10);
  assert.ok(elapsed < DELAY_MS * 4, `10 queries took ${elapsed}ms; serialized would be ~${DELAY_MS * 10}ms`);
});

test("an open transaction has the connection to itself until it commits", async () => {
  const log = { maxActive: 0, events: [] };
  const adapter = await new FakeFactory(log).connect();
  const before = adapter.queryRaw(query("before"));
  const tx = await adapter.startTransaction();
  assert.ok(log.events.includes("end:before"), "transaction waited for in-flight reads");
  const during = adapter.queryRaw(query("during"));
  await tx.queryRaw(query("inside"));
  await sleep(DELAY_MS);
  assert.equal(log.events.includes("start:during"), false, "reads wait while the transaction is open");
  await tx.commit();
  await Promise.all([before, during]);
  assert.ok(log.events.indexOf("start:during") > log.events.indexOf("commit"));
});

test("read-write lock is FIFO so a waiting writer is not starved", async () => {
  const lock = new ReadWriteLock();
  const order = [];
  const r1 = await lock.acquire();
  const writer = lock.acquire(true).then((release) => {
    order.push("writer");
    release();
  });
  const reader = lock.acquire().then((release) => {
    order.push("reader");
    release();
  });
  await sleep(5);
  assert.deepEqual(order, []);
  r1();
  await Promise.all([writer, reader]);
  assert.deepEqual(order, ["writer", "reader"]);
});
