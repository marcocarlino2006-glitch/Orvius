import { NextRequest, NextResponse } from "next/server";
import { getBearerToken, secretsMatch, verifyAdminRequest } from "@/lib/env";
import { logError } from "@/lib/logger";
import { turnOnNeverChosenShops } from "@/lib/network-choice";
import { approvalOk, backupRefOk, ensureCallReview, callReviewPlanSha256, type SqlRunner } from "@/lib/call-review-schema";
import { prisma } from "@/lib/prisma";
import { isUnauthenticatedAccessAllowed } from "@/lib/runtime";
import { scheduledTargetRefusal } from "@/lib/scheduled-target";

/*
  Creates CallReview on the database this deployment already holds, then turns
  the network on for shops that never chose and whose address has a ZIP.
  A shop that turned the network off is left off. The database credentials
  live on the host. The statements are the CallReview section of
  prisma/turso-migrate.sql. The request cannot send SQL.
*/
export const maxDuration = 60;

function authorize(request: NextRequest) {
  if (isUnauthenticatedAccessAllowed()) return null;
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (!secretsMatch(getBearerToken(request), cronSecret) && !verifyAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function runner(): SqlRunner {
  return {
    execute: async (sql, args = []) => {
      await prisma.$executeRawUnsafe(sql, ...args);
    },
    query: (sql, args = []) => prisma.$queryRawUnsafe(sql, ...args),
  };
}

export async function GET(request: NextRequest) {
  const denied = authorize(request);
  if (denied) return denied;
  return NextResponse.json({ error: "POST creates the call review table after a backup" }, { status: 405 });
}

export async function POST(request: NextRequest) {
  const denied = authorize(request);
  if (denied) return denied;
  const refusal = scheduledTargetRefusal(request.headers);
  if (refusal) return NextResponse.json({ error: refusal }, { status: 409 });

  const approval = request.headers.get("x-orvius-approval");
  const backupRef = request.headers.get("x-orvius-backup-ref");
  const presented = request.headers.get("x-orvius-plan-sha256")?.trim().toLowerCase() ?? "";
  const planSha256 = callReviewPlanSha256();
  if (!approvalOk(approval)) return NextResponse.json({ error: "x-orvius-approval is missing" }, { status: 400 });
  if (!backupRefOk(backupRef)) return NextResponse.json({ error: "x-orvius-backup-ref is missing" }, { status: 400 });
  if (presented !== planSha256) {
    return NextResponse.json({ error: `the reviewed checksum is ${planSha256}` }, { status: 409 });
  }

  const release = request.headers.get("x-orvius-release")!.trim().toLowerCase();
  const target = request.headers.get("x-orvius-target")!.trim();
  try {
    const result = await ensureCallReview(runner(), {
      release,
      target,
      host: request.nextUrl.host,
      approval: approval!.trim(),
      backupRef: backupRef!.trim(),
      planSha256,
    });
    const networkTurnedOn = await turnOnNeverChosenShops();
    return NextResponse.json({ ok: true, ...result, networkTurnedOn });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError("platform_audit.schema_failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
