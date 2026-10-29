/*
  A duplicate on a unique index is the normal way a retry or a race announces
  itself, and the callers that expect it treat it as "already done".

  Prisma reports it as P2002 on the local SQLite engine. Through the libSQL
  adapter that production uses, the same failure arrives without a code, only as
  SQLite's own text ("UNIQUE constraint failed"). Matching the code alone let
  every duplicate in production throw instead of being ignored.
*/
const SQLITE_UNIQUE = /UNIQUE constraint failed|SQLITE_CONSTRAINT_(UNIQUE|PRIMARYKEY)/i;

export function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === "object" && !seen.has(current); depth++) {
    seen.add(current);
    const record = current as { code?: unknown; message?: unknown; cause?: unknown; meta?: { message?: unknown } };
    if (record.code === "P2002") return true;
    if (typeof record.message === "string" && SQLITE_UNIQUE.test(record.message)) return true;
    if (typeof record.meta?.message === "string" && SQLITE_UNIQUE.test(record.meta.message)) return true;
    current = record.cause;
  }
  return typeof error === "string" && SQLITE_UNIQUE.test(error);
}
