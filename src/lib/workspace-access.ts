import type { Business } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ACTIVE_SHOP_COOKIE,
  isMemberRole,
  type ShopRole,
  type ShopSummary,
} from "@/lib/workspace-access-labels";

export * from "@/lib/workspace-access-labels";

/*
  Who can reach which shop. The owner is Business.ownerEmail; everyone else is
  a Membership. One person can hold several shops (a multi-location operator),
  and the active one is remembered in a cookie so every API resolves the same
  shop for the whole session.
*/

export type ShopAccess = { business: Business; role: ShopRole };

/** Every active shop this email can open, owned shops first, oldest first. */
export async function listShopAccess(email: string): Promise<ShopAccess[]> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return [];
  const [owned, memberships] = await Promise.all([
    prisma.business.findMany({
      where: { ownerEmail: normalized, isActive: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.membership.findMany({
      where: { email: normalized, business: { isActive: true } },
      include: { business: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const seen = new Set(owned.map((b) => b.id));
  return [
    ...owned.map((business) => ({ business, role: "owner" as const })),
    ...memberships
      .filter((m) => !seen.has(m.businessId))
      .map((m) => ({ business: m.business, role: (isMemberRole(m.role) ? m.role : "dispatcher") as ShopRole })),
  ];
}

export function summarizeShops(access: ShopAccess[]): ShopSummary[] {
  return access.map(({ business, role }) => ({ id: business.id, name: business.name, role, trade: business.trade ?? null }));
}

/** The shop to open: the remembered one if still reachable, otherwise the first. */
export function pickActiveShop(access: ShopAccess[], preferredId: string | null | undefined): ShopAccess | null {
  if (!access.length) return null;
  return (preferredId && access.find((a) => a.business.id === preferredId)) || access[0];
}

/** The active-shop cookie, or null outside a request (scripts, tests). */
export async function readActiveShopCookie(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    return (await cookies()).get(ACTIVE_SHOP_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

export async function resolveShopAccess(email: string, preferredId?: string | null): Promise<ShopAccess | null> {
  const access = await listShopAccess(email);
  return pickActiveShop(access, preferredId === undefined ? await readActiveShopCookie() : preferredId);
}

/** Whether this email may sign in at all: it owns a shop or was added to one. */
export async function hasAnyShopAccess(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const [owned, member] = await Promise.all([
    prisma.business.findFirst({ where: { ownerEmail: normalized, isActive: true }, select: { id: true } }),
    prisma.membership.findFirst({ where: { email: normalized, business: { isActive: true } }, select: { id: true } }),
  ]);
  return Boolean(owned || member);
}
