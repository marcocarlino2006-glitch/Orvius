import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

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

    const adapter = new PrismaLibSql({
      url: tursoUrl,
      authToken,
    });

    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
