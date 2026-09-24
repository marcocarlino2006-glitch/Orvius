import { PrismaLibSql } from "@prisma/adapter-libsql";

type Release = () => void;

/** Shared holders for plain queries, one exclusive holder for transactions. FIFO, so a waiting transaction is not starved. */
export class ReadWriteLock {
  #readers = 0;
  #writer = false;
  #queue: Array<{ exclusive: boolean; resolve: (release: Release) => void }> = [];

  acquire(exclusive = false): Promise<Release> {
    return new Promise((resolve) => {
      this.#queue.push({ exclusive, resolve });
      this.#drain();
    });
  }

  #drain() {
    while (this.#queue.length && !this.#writer) {
      const next = this.#queue[0];
      if (next.exclusive) {
        if (this.#readers > 0) return;
        this.#queue.shift();
        this.#writer = true;
        next.resolve(this.#release(true));
        return;
      }
      this.#queue.shift();
      this.#readers += 1;
      next.resolve(this.#release(false));
    }
  }

  #release(exclusive: boolean): Release {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (exclusive) this.#writer = false;
      else this.#readers -= 1;
      this.#drain();
    };
  }
}

type LockableAdapter = Record<string | symbol, unknown> & {
  startTransaction?: (...args: unknown[]) => Promise<unknown>;
  executeScript?: (...args: unknown[]) => Promise<unknown>;
};

/*
  @prisma/adapter-libsql guards every query with one Mutex, so Promise.all over
  a remote Turso database runs one network round trip at a time. The libsql
  HTTP and WebSocket clients open a stream per execute and are safe to run
  concurrently; only transactions and scripts need the connection to
  themselves. Both call acquire() synchronously before their first await,
  which is what lets the pending-exclusive counter mark the right caller.
  Returns false and leaves the adapter untouched if its internals change.
*/
export function shareAdapterLock(adapter: object): boolean {
  const target = adapter as LockableAdapter;
  const tag = Object.getOwnPropertySymbols(target).find(
    (symbol) => typeof (target[symbol] as { acquire?: unknown } | undefined)?.acquire === "function",
  );
  if (!tag || typeof target.startTransaction !== "function" || typeof target.executeScript !== "function") {
    return false;
  }

  const lock = new ReadWriteLock();
  let exclusivePending = 0;
  target[tag] = {
    acquire: () => {
      if (exclusivePending > 0) {
        exclusivePending -= 1;
        return lock.acquire(true);
      }
      return lock.acquire(false);
    },
  };

  for (const method of ["startTransaction", "executeScript"] as const) {
    const original = target[method]!.bind(target);
    target[method] = (...args: unknown[]) => {
      const before = exclusivePending;
      exclusivePending += 1;
      const result = original(...args);
      if (exclusivePending > before) exclusivePending = before;
      return result;
    };
  }
  return true;
}

export class ConcurrentPrismaLibSql extends PrismaLibSql {
  override async connect() {
    const adapter = await super.connect();
    if (!shareAdapterLock(adapter)) {
      console.warn("[prisma] libsql adapter internals changed; queries stay serialized");
    }
    return adapter;
  }
}
