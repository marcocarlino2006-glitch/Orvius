import { PrismaClient } from "@prisma/client";
import { ConcurrentPrismaLibSql } from "@/lib/prisma-libsql-concurrent";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";

  if (databaseUrl.startsWith("libsql://")) {
    const parsed = new URL(databaseUrl);
    const authToken =
      parsed.searchParams.get("authToken")?.trim() ??
      process.env.TURSO_AUTH_TOKEN?.trim() ??
      "";

    if (!authToken) {
      throw new Error(
        "Turso DATABASE_URL requires ?authToken=... or TURSO_AUTH_TOKEN",
      );
    }

    parsed.searchParams.delete("authToken");
    const tursoUrl = parsed.toString();

    const adapter = new ConcurrentPrismaLibSql({
      url: tursoUrl,
      authToken,
    });

    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }

  if (databaseUrl.startsWith("file:") && process.env.PRISMA_SQLITE_ADAPTER === "libsql") {
    /*
      Same adapter as Turso, so a SQLite file behaves like production under
      load — Prisma's built-in SQLite engine lets concurrent interactive
      transactions lock each other out (at five simultaneous webhooks most
      requests hit its 5-second timeout). Opt-in and only on a fresh file:
      the built-in engine stores DateTime as integer milliseconds and libsql
      as ISO text, and a file holding both compares dates wrongly.
    */
    return new PrismaClient({
      adapter: new ConcurrentPrismaLibSql({ url: resolveSqliteUrl(databaseUrl) }),
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

/** Prisma resolves a relative SQLite path from prisma/; libsql resolves it from the working directory. */
export function resolveSqliteUrl(databaseUrl: string, cwd = process.cwd()): string {
  const path = databaseUrl.slice("file:".length).split("?")[0];
  if (path.startsWith("/")) return `file:${path}`;
  return `file:${cwd.replace(/\/$/, "")}/prisma/${path.replace(/^\.\//, "")}`;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
