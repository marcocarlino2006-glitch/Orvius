import { prisma } from "@/lib/prisma";

/**
 * A person's own sample shop (demo-workspace). It is a separate tenant whose
 * activity is always simulated: no carrier, no voice provider, no card
 * processor, no field-software push and no email leaves for it — even if an
 * old row still carries a real line, Connect account or API key.
 *
 * The public reference shop (summit-hvac-demo) is environment=demo too, but it
 * owns the marketing line and is not a person's sample shop, so it is not
 * fenced here.
 */
export const OWNER_DEMO_SLUG_PREFIX = "demo-";

export function isOwnerDemoWorkspace(shop: { environment?: string | null; slug?: string | null } | null | undefined): boolean {
  return shop?.environment === "demo" && Boolean(shop.slug?.startsWith(OWNER_DEMO_SLUG_PREFIX));
}

/** Prisma filter that leaves a person's sample shops out of "which shop is theirs" lookups. */
export const NOT_OWNER_DEMO = { NOT: { environment: "demo", slug: { startsWith: OWNER_DEMO_SLUG_PREFIX } } } as const;

export class DemoFenceError extends Error {
  constructor(action: string) {
    super(`${action} is simulated in the demo shop — nothing real was sent, charged or changed.`);
    this.name = "DemoFenceError";
  }
}

export async function isOwnerDemoWorkspaceId(businessId: string | null | undefined): Promise<boolean> {
  if (!businessId) return false;
  const shop = await prisma.business.findUnique({ where: { id: businessId }, select: { environment: true, slug: true } });
  return isOwnerDemoWorkspace(shop);
}

/** Throws before any real provider call is made for a sample shop. */
export async function assertLiveActionAllowed(businessId: string | null | undefined, action: string): Promise<void> {
  if (await isOwnerDemoWorkspaceId(businessId)) throw new DemoFenceError(action);
}
