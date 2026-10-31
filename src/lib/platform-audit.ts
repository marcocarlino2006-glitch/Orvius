import { auth } from "@/auth";
import { verifyAdminRequest } from "@/lib/env";
import { isFounderEmail } from "@/lib/founder";
import { logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

/**
 * Every change made from the founder console or with the admin key leaves a
 * row saying who, what and to which shop. Reads are not recorded; changes are.
 */
export type PlatformActor = { actorKind: "founder" | "admin_key" | "staff"; actorEmail: string | null };

/** Allow-listed staff are let into the prospect pipeline without being founders; record them as themselves. */
export async function staffActor(request: Request): Promise<PlatformActor | null> {
  const actor = await privilegedActor(request);
  if (actor) return actor;
  const email = (await auth())?.user?.email?.trim().toLowerCase();
  return email ? { actorKind: "staff", actorEmail: email } : null;
}

export function founderActor(email: string | null | undefined): PlatformActor | null {
  const normalized = email?.trim().toLowerCase();
  return normalized && isFounderEmail(normalized) ? { actorKind: "founder", actorEmail: normalized } : null;
}

/** Who is acting on this request, or null when nobody privileged is. The key wins, as it does at the gate. */
export async function privilegedActor(request: Request): Promise<PlatformActor | null> {
  if (verifyAdminRequest(request)) return { actorKind: "admin_key", actorEmail: null };
  const session = await auth();
  return founderActor(session?.user?.email);
}

/** Never the reason an admin action fails: a write error is logged, not thrown. */
export async function recordPlatformAudit(
  actor: PlatformActor | null,
  input: { action: string; summary: string; businessId?: string | null; detail?: Record<string, unknown> | null },
): Promise<void> {
  const who = actor ?? { actorKind: "admin_key" as const, actorEmail: null };
  logInfo("admin.action", { action: input.action, actorKind: who.actorKind, businessId: input.businessId ?? null });
  try {
    await prisma.platformAuditEvent.create({
      data: {
        action: input.action,
        actorKind: who.actorKind,
        actorEmail: who.actorEmail,
        businessId: input.businessId ?? null,
        summary: input.summary.slice(0, 500),
        detailJson: input.detail ? JSON.stringify(input.detail).slice(0, 4000) : null,
      },
    });
  } catch (error) {
    logWarn("admin.audit_write_failed", { action: input.action, error: error instanceof Error ? error.message : String(error) });
  }
}

export async function recentPlatformAudit(limit = 50) {
  try {
    return await prisma.platformAuditEvent.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  } catch {
    return null;
  }
}
