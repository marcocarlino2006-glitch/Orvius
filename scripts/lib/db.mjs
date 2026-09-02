import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadEnvFile(envPath = resolve(__dirname, "../../.env")) {
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

export function createScriptPrisma() {
  loadEnvFile();
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";

  if (databaseUrl.startsWith("libsql://")) {
    const parsed = new URL(databaseUrl);
    const authToken =
      parsed.searchParams.get("authToken")?.trim() ??
      process.env.TURSO_AUTH_TOKEN?.trim() ??
      "";
    if (!authToken) {
      throw new Error("Turso DATABASE_URL requires authToken");
    }
    parsed.searchParams.delete("authToken");
    const adapter = new PrismaLibSql({
      url: parsed.toString(),
      authToken,
    });
    return new PrismaClient({ adapter });
  }

  return new PrismaClient();
}
