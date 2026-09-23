import { NextResponse } from "next/server";
import { isEmailConfigured, sendOwnerEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import {
  formatWeeklyProof,
  getShopOutcomes,
} from "@/lib/shop-outcomes";
import { requireBusinessSession } from "@/lib/tenant";

async function buildProof(businessId: string, businessName: string, windowDays: number) {
  const outcomes = await getShopOutcomes(businessId, windowDays);
  const text = formatWeeklyProof(outcomes, businessName);
  return { outcomes, text };
}

export type WeeklyProofEmailStatus =
  | { attempted: false; reason: "not_requested" }
  | { attempted: false; reason: "email_not_configured" }
  | { attempted: false; reason: "no_owner_email" }
  | { attempted: true; sent: true; id: string }
  | { attempted: true; sent: false; reason: "send_failed"; detail?: string };

/**
 * Preview weekly proof text — does NOT stamp lastWeeklyProofAt.
 * Use POST for the design-partner ritual (copy + stamp + optional email).
 */
export async function GET(request: Request) {
  const session = await requireBusinessSession();
  if ("error" in session) return session.error;

  const url = new URL(request.url);
  const windowDays = Math.min(
    30,
    Math.max(1, Number(url.searchParams.get("windowDays") ?? 7) || 7),
  );

  const { outcomes, text } = await buildProof(
    session.business.id,
    session.business.name,
    windowDays,
  );

  return NextResponse.json({
    shop: { id: session.business.id, name: session.business.name },
    outcomes,
    text,
    stamped: false,
    emailConfigured: isEmailConfigured(),
    hasOwnerEmail: Boolean(session.business.ownerEmail?.trim()),
    disclaimer:
      "Estimates use owner-reported baseline and avg ticket plus recorded CRM money. Not audited revenue.",
  });
}

/**
 * Weekly proof ritual — returns artifact and stamps lastWeeklyProofAt.
 * When Resend is configured and the shop has ownerEmail, also emails the
 * proof. Stamp happens on intentional ritual regardless of email outcome —
 * Resend key alone never counts as proof-sent / mastery green.
 */
export async function POST(request: Request) {
  const session = await requireBusinessSession();
  if ("error" in session) return session.error;

  let windowDays = 7;
  let wantEmail = true;
  try {
    const body = (await request.json().catch(() => null)) as {
      windowDays?: number;
      email?: boolean;
    } | null;
    if (body?.windowDays != null) {
      windowDays = Math.min(30, Math.max(1, Number(body.windowDays) || 7));
    }
    if (body?.email === false) wantEmail = false;
  } catch {
    /* default window */
  }

  const { outcomes, text } = await buildProof(
    session.business.id,
    session.business.name,
    windowDays,
  );

  let email: WeeklyProofEmailStatus = {
    attempted: false,
    reason: "not_requested",
  };

  if (wantEmail) {
    const ownerEmail = session.business.ownerEmail?.trim() ?? "";
    if (!isEmailConfigured()) {
      email = { attempted: false, reason: "email_not_configured" };
    } else if (!ownerEmail) {
      email = { attempted: false, reason: "no_owner_email" };
    } else {
      try {
        const id = await sendOwnerEmail({
          to: ownerEmail,
          subject: `Orvius weekly proof — ${session.business.name}`,
          text,
        });
        email = { attempted: true, sent: true, id };
      } catch (err) {
        email = {
          attempted: true,
          sent: false,
          reason: "send_failed",
          detail: err instanceof Error ? err.message : "send_failed",
        };
      }
    }
  }

  const stampedAt = new Date();
  await prisma.business.update({
    where: { id: session.business.id },
    data: { lastWeeklyProofAt: stampedAt },
  });

  return NextResponse.json({
    shop: { id: session.business.id, name: session.business.name },
    outcomes,
    text,
    stamped: true,
    lastWeeklyProofAt: stampedAt.toISOString(),
    email,
    disclaimer:
      "Estimates use owner-reported baseline and avg ticket plus recorded CRM money. Not audited revenue.",
  });
}
