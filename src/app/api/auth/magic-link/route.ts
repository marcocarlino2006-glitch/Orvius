import { NextRequest, NextResponse } from "next/server";
import { isEmailConfigured, sendOwnerEmail } from "@/lib/email";
import {
  LINK_TTL_MINUTES,
  buildMagicLinkEmail,
  buildMagicLinkUrl,
  issueMagicLink,
} from "@/lib/magic-link";
import { isDevAuthBypassEnabled } from "@/lib/dev-auth";

export const dynamic = "force-dynamic";

export type MagicLinkResponse = {
  /** True whenever the caller should be told to check their inbox. */
  sent: boolean;
  message: string;
  ttlMinutes?: number;
  /** Local builds only: the link, so sign-in is testable without a mail key. */
  devLink?: string;
};

/**
 * Request a sign-in link.
 *
 * A rejected address and an accepted one return the same body. Telling a
 * stranger whether an email belongs to a shop owner turns this endpoint into an
 * account-enumeration oracle, and the rate limiter behind it would then just be
 * a slower oracle.
 *
 * The single honest exception is a deployment with no mail provider: replying
 * "check your inbox" when nothing was sent would strand the operator.
 */
export async function POST(request: NextRequest) {
  let email = "";
  try {
    const body = (await request.json()) as { email?: unknown };
    email = typeof body.email === "string" ? body.email : "";
  } catch {
    email = "";
  }

  const generic: MagicLinkResponse = {
    sent: true,
    message: "If that address has Orvius access, a sign-in link is on its way.",
    ttlMinutes: LINK_TTL_MINUTES,
  };

  const devBypass = isDevAuthBypassEnabled();
  if (!isEmailConfigured() && !devBypass) {
    return NextResponse.json(
      {
        sent: false,
        message:
          "Email sign-in is not configured on this deployment. Use Google, or set RESEND_API_KEY.",
      } satisfies MagicLinkResponse,
      { status: 503 },
    );
  }

  const issued = await issueMagicLink(email);
  if (!issued.ok) {
    // Malformed input is the caller's own typo, so that one is worth saying out
    // loud; the rest stay behind the generic reply.
    if (issued.reason === "invalid-email") {
      return NextResponse.json(
        { sent: false, message: "Enter a valid email address." } satisfies MagicLinkResponse,
        { status: 400 },
      );
    }
    return NextResponse.json(generic);
  }

  const link = buildMagicLinkUrl(issued.token);

  if (isEmailConfigured()) {
    const message = buildMagicLinkEmail(link);
    try {
      await sendOwnerEmail({ to: issued.email, ...message });
    } catch {
      return NextResponse.json(
        {
          sent: false,
          message: "We could not send the link just now. Try again, or use Google.",
        } satisfies MagicLinkResponse,
        { status: 502 },
      );
    }
    return NextResponse.json(generic);
  }

  // Dev bypass without a mail key: hand the link back so the flow is testable.
  return NextResponse.json({ ...generic, devLink: link } satisfies MagicLinkResponse);
}
