import type { Business, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logWarn } from "@/lib/logger";
import { ensureAssistantCurrent } from "@/lib/sync-business-assistant";

const PAGE = 8;

/* Same shops the daily sweep rewrites. A dispatch walks them in id order so a
   run that hits its deadline can resume, instead of starting at random. */
export const liveAssistantWhere = {
  isActive: true,
  vapiAssistantId: { not: null },
  environment: { not: "test" },
} satisfies Prisma.BusinessWhereInput;

type Outcome = "current" | "updated" | "skipped";

/**
 * Rewrite each live receptionist to the deployed prompt.
 * Stops at the budget and returns the last shop id so the caller can resume.
 * Does not bill, text, or suspend anyone.
 */
export async function syncLiveAssistants(opts: {
  budgetMs?: number;
  after?: string | null;
  now?: () => number;
  /** Extra constraint, ANDed with the live-shop filter. It cannot widen that filter. */
  narrow?: Prisma.BusinessWhereInput;
  sync?: (shop: Business) => Promise<Outcome>;
} = {}) {
  const now = opts.now ?? (() => Date.now());
  const started = now();
  const budgetMs = opts.budgetMs ?? 45_000;
  const sync = opts.sync ?? ensureAssistantCurrent;
  const counts: Record<Outcome, number> = { current: 0, updated: 0, skipped: 0 };
  let cursor = opts.after?.trim() || "";
  const base: Prisma.BusinessWhereInput = opts.narrow ? { AND: [liveAssistantWhere, opts.narrow] } : liveAssistantWhere;
  const pageWhere = () => (cursor ? { AND: [base, { id: { gt: cursor } }] } : base);

  while (now() - started < budgetMs) {
    const page = await prisma.business.findMany({
      where: pageWhere(),
      orderBy: { id: "asc" },
      take: PAGE,
    });
    if (!page.length) return { ...counts, done: true, after: null };
    await Promise.all(
      page.map(async (shop) => {
        try {
          counts[await sync(shop)] += 1;
        } catch (error) {
          counts.skipped += 1;
          logWarn("vapi.assistant.resync_failed", {
            businessId: shop.id,
            error: error instanceof Error ? error.message : "unknown",
          });
        }
      }),
    );
    cursor = page[page.length - 1]!.id;
    if (page.length < PAGE) return { ...counts, done: true, after: null };
  }

  const remaining = await prisma.business.count({ where: pageWhere() });
  return { ...counts, done: remaining === 0, after: remaining === 0 ? null : cursor || null };
}
