import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  formatWeeklyProof,
  getShopOutcomes,
} from "@/lib/shop-outcomes";
import { requireBusinessSession } from "@/lib/tenant";

/**
 * Weekly economics proof artifact for design partners.
 * Honest labels — estimates from baseline/avg ticket + CRM records.
 */
export async function GET(request: Request) {
  const session = await requireBusinessSession();
  if ("error" in session) return session.error;

  const url = new URL(request.url);
  const windowDays = Math.min(
    30,
    Math.max(1, Number(url.searchParams.get("windowDays") ?? 7) || 7),
  );

  const outcomes = await getShopOutcomes(session.business.id, windowDays);
  const text = formatWeeklyProof(outcomes, session.business.name);

  await prisma.business.update({
    where: { id: session.business.id },
    data: { lastWeeklyProofAt: new Date() },
  });

  return NextResponse.json({
    shop: {
      id: session.business.id,
      name: session.business.name,
    },
    outcomes,
    text,
    disclaimer:
      "Estimates use owner-reported baseline and avg ticket plus recorded CRM money. Not audited revenue.",
  });
}
