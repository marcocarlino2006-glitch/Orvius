import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/env";
import { processNotificationQueue } from "@/lib/notifications";
import { isProduction } from "@/lib/runtime";

/**
 * Night-shift product: queue must drain often.
 * Production ALWAYS requires CRON_SECRET (or admin). Fail closed — never open.
 */
function authorize(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  if (verifyAdminRequest(request)) return true;

  if (isProduction()) {
    if (!cronSecret) return false;
    return bearer === cronSecret;
  }

  // Non-prod: allow secret match when set; otherwise allow local dogfood.
  if (cronSecret) return bearer === cronSecret;
  return true;
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        detail: isProduction()
          ? "Set CRON_SECRET and pass Authorization: Bearer <secret>"
          : "Cron secret mismatch",
      },
      { status: 401 },
    );
  }

  const result = await processNotificationQueue(50);
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
