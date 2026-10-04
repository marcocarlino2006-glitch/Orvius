import { NextRequest, NextResponse } from "next/server";
import { createPasswordAccount } from "@/lib/password-auth";
import { getPublicLaunchReadiness } from "@/lib/public-launch-readiness";
import { clientIp, sharedRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export type SignUpResponse = { ok: boolean; message?: string };

/** Creates the login only; the client signs in with the same credentials next. */
export async function POST(request: NextRequest) {
  const limit = await sharedRateLimit({
    key: `signup:${clientIp(request)}`,
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, message: "Too many signups from here. Try again later." } satisfies SignUpResponse,
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  let email = "";
  let password = "";
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown };
    email = typeof body.email === "string" ? body.email : "";
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    // Falls through to validation with empty fields.
  }

  const result = await createPasswordAccount(email, password, {
    publicSignupReady: getPublicLaunchReadiness().ready,
  });
  if (result.ok) return NextResponse.json({ ok: true } satisfies SignUpResponse);

  const status =
    result.reason === "closed" ? 403 : result.reason === "exists" || result.reason === "claimed" ? 409 : 400;
  return NextResponse.json({ ok: false, message: result.message } satisfies SignUpResponse, { status });
}
