import { NextRequest, NextResponse } from "next/server";
import { company } from "@/lib/company";
import { isEmailConfigured, sendOwnerEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/env";
import { LINK_TTL_MINUTES, consumeMagicLink, issueMagicLink } from "@/lib/magic-link";
import { passwordProblem, setVerifiedPassword } from "@/lib/password-auth";
import { clientIp, sharedRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export type PasswordResetResponse = { ok: boolean; message: string; email?: string };

const GENERIC = "If that email has an Orvius account, a reset link is on its way.";

async function limited(request: NextRequest, action: string) {
  const limit = await sharedRateLimit({
    key: `password-reset-${action}:${clientIp(request)}`,
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  return limit.ok
    ? null
    : NextResponse.json(
        { ok: false, message: "Too many attempts. Try again later." } satisfies PasswordResetResponse,
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
      );
}

async function readBody(request: NextRequest) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Request a reset link. Same reply for known and unknown addresses. Proving the
 * address is what the link is for, so a reset never works from a session alone.
 */
export async function POST(request: NextRequest) {
  const blocked = await limited(request, "request");
  if (blocked) return blocked;
  if (!isEmailConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Password reset isn't available right now. Use Google." } satisfies PasswordResetResponse,
      { status: 503 },
    );
  }

  const body = await readBody(request);
  const issued = await issueMagicLink(typeof body.email === "string" ? body.email : "");
  if (!issued.ok) {
    if (issued.reason === "invalid-email") {
      return NextResponse.json(
        { ok: false, message: "Enter a valid email address." } satisfies PasswordResetResponse,
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, message: GENERIC } satisfies PasswordResetResponse);
  }

  const link = new URL("/signin/reset", getAppUrl());
  link.searchParams.set("token", issued.token);
  try {
    await sendOwnerEmail({
      to: issued.email,
      subject: `Reset your ${company.productName} password`,
      text: [
        `Choose a new ${company.productName} password:`,
        "",
        link.toString(),
        "",
        `This link works once and expires in ${LINK_TTL_MINUTES} minutes.`,
        "If you didn't ask for this, ignore this email and your password stays the same.",
      ].join("\n"),
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "We couldn't send the email just now. Try again." } satisfies PasswordResetResponse,
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, message: GENERIC } satisfies PasswordResetResponse);
}

/** Redeem the link and set the new password. */
export async function PUT(request: NextRequest) {
  const blocked = await limited(request, "redeem");
  if (blocked) return blocked;
  const body = await readBody(request);
  const password = typeof body.password === "string" ? body.password : "";
  const token = typeof body.token === "string" ? body.token : "";

  const weak = passwordProblem(password);
  if (weak) {
    return NextResponse.json({ ok: false, message: weak } satisfies PasswordResetResponse, { status: 400 });
  }

  const email = await consumeMagicLink(token);
  if (!email) {
    return NextResponse.json(
      {
        ok: false,
        message: "That reset link is no longer valid. Links work once and expire after 10 minutes.",
      } satisfies PasswordResetResponse,
      { status: 400 },
    );
  }

  const saved = await setVerifiedPassword(email, password);
  if (!saved.ok) {
    return NextResponse.json({ ok: false, message: saved.message } satisfies PasswordResetResponse, { status: 400 });
  }
  return NextResponse.json({ ok: true, message: "Password saved.", email } satisfies PasswordResetResponse);
}
