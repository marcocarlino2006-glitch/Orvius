import { mintPublicToken } from "@/lib/public-tokens";
import { prisma } from "@/lib/prisma";

/** Ensure a job has a tech magic-link token; mint if missing. */
export async function ensureJobTechToken(jobId: string): Promise<string> {
  const existing = await prisma.job.findUnique({
    where: { id: jobId },
    select: { techToken: true },
  });
  if (existing?.techToken) return existing.techToken;

  const techToken = mintPublicToken();
  await prisma.job.update({
    where: { id: jobId },
    data: { techToken },
  });
  return techToken;
}

/* The link shows a customer's name, phone and address, so it closes once the visit is well behind the shop. */
export const TECH_LINK_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export function techLinkExpired(job: { status: string; scheduledAt: Date | null }, now = new Date()) {
  if (job.status === "cancelled") return true;
  return Boolean(job.scheduledAt && now.getTime() > job.scheduledAt.getTime() + TECH_LINK_GRACE_MS);
}
