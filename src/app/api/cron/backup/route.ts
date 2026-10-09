import { NextRequest, NextResponse } from "next/server";
import { backupPassphrase, databaseClient, decryptDump, encryptDump, restoreDrill, takeBackup } from "@/lib/db-backup";
import { getBearerToken, secretsMatch, verifyAdminRequest } from "@/lib/env";
import { logError, logInfo } from "@/lib/logger";
import { isUnauthenticatedAccessAllowed } from "@/lib/runtime";

/*
  Driven nightly by .github/workflows/backup.yml. Returns the encrypted backup
  only after the encrypted bytes themselves have been decrypted and restored
  into a fresh database with every row count matching.
*/
export const maxDuration = 60;

/* Vercel refuses responses over 4.5 MB; fail loudly before that rather than truncate. */
const MAX_RESPONSE_BYTES = 4_300_000;

export async function GET(request: NextRequest) {
  if (!isUnauthenticatedAccessAllowed()) {
    const cronSecret = process.env.CRON_SECRET?.trim();
    if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    if (!secretsMatch(getBearerToken(request), cronSecret) && !verifyAdminRequest(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const passphrase = backupPassphrase();
  if (!passphrase) {
    return NextResponse.json({ error: "No backup key: set AUTH_SECRET and CRON_SECRET, or a 32+ character BACKUP_ENCRYPTION_KEY" }, { status: 503 });
  }

  const db = databaseClient();
  try {
    const dump = await takeBackup(db);
    const sealed = encryptDump(dump, passphrase);
    const drill = await restoreDrill(decryptDump(sealed, passphrase));
    if (drill.mismatches.length) {
      logError("backup.drill_mismatch", { mismatches: drill.mismatches });
      return NextResponse.json({ error: "Restore drill failed", mismatches: drill.mismatches }, { status: 500 });
    }
    if (sealed.length > MAX_RESPONSE_BYTES) {
      logError("backup.too_large", { bytes: sealed.length });
      return NextResponse.json(
        { error: `Encrypted backup is ${sealed.length} bytes, over what one response can carry. Move the nightly backup to the GitHub path (BACKUP_DATABASE_URL).` },
        { status: 507 },
      );
    }
    logInfo("backup.taken", { tables: drill.tables, rows: drill.rows, bytes: sealed.length });
    return new NextResponse(new Uint8Array(sealed), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Orvius-Backup": `tables=${drill.tables};rows=${drill.rows};restored=ok`,
      },
    });
  } catch (error) {
    logError("backup.failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Backup failed" }, { status: 500 });
  } finally {
    db.close();
  }
}
