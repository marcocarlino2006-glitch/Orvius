import { prisma } from "@/lib/prisma";
import { winBackAudience } from "@/lib/win-back";

export type ReactivationValue = {
  audience3: number;
  audience6: number;
  audience12: number;
  avgTicketCents: number | null;
  /** 6-month dormant audience at the owner's average ticket. An estimate, never a promise. */
  estimatedCents: number | null;
};

/**
 * The second engine, sized: how many opted-in customers have gone quiet at
 * each win-back horizon, and what waking the 6-month group is worth at the
 * owner's own average ticket. Counting only — sending stays the owner's tap
 * in win-back.ts, with its consent, STOP and daytime rules untouched.
 */
export async function getReactivationValue(
  businessId: string,
  audience: (id: string, months: number) => Promise<unknown[]> = winBackAudience,
  client = prisma,
): Promise<ReactivationValue> {
  const [a3, a6, a12, business] = await Promise.all([
    audience(businessId, 3),
    audience(businessId, 6),
    audience(businessId, 12),
    client.business.findUnique({ where: { id: businessId }, select: { avgTicketCents: true } }),
  ]);
  const avgTicketCents = business?.avgTicketCents ?? null;
  return {
    audience3: a3.length,
    audience6: a6.length,
    audience12: a12.length,
    avgTicketCents,
    estimatedCents: avgTicketCents != null ? a6.length * avgTicketCents : null,
  };
}
