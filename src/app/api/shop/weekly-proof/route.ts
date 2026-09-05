import { NextResponse } from "next/server";
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

/**
 * Preview weekly proof text — does NOT stamp lastWeeklyProofAt.
 * Use POST for the design-partner ritual (copy + stamp).
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
    disclaimer:
      "Estimates use owner-reported baseline and avg ticket plus recorded CRM money. Not audited revenue.",
  });
}

/**
 * Weekly proof ritual — returns artifact and stamps lastWeeklyProofAt.
 * Only call when the owner intentionally copies proof.
 */
export async function POST(request: Request) {
  const session = await requireBusinessSession();
  if ("error" in session) return session.error;

  let windowDays = 7;
  try {
    const body = (await request.json().catch(() => null)) as {
      windowDays?: number;
    } | null;
    if (body?.windowDays != null) {
      windowDays = Math.min(30, Math.max(1, Number(body.windowDays) || 7));
    }
  } catch {
    /* default window */
  }

  const { outcomes, text } = await buildProof(
    session.business.id,
    session.business.name,
    windowDays,
  );

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
    disclaimer:
      "Estimates use owner-reported baseline and avg ticket plus recorded CRM money. Not audited revenue.",
  });
}
