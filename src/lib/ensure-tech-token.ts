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
/* A job nobody ever put on the calendar still has a customer behind it; its link cannot stay open for good. */
export const UNSCHEDULED_TECH_LINK_MS = 30 * 24 * 60 * 60 * 1000;

export function techLinkExpired(
  job: { status: string; scheduledAt: Date | null; completedAt?: Date | null; createdAt?: Date | null },
  now = new Date(),
) {
  if (job.status === "cancelled") return true;
  const past = (at: Date | null | undefined, ms: number) => Boolean(at && now.getTime() > at.getTime() + ms);
  if (past(job.completedAt, TECH_LINK_GRACE_MS)) return true;
  if (job.scheduledAt) return past(job.scheduledAt, TECH_LINK_GRACE_MS);
  return past(job.createdAt, UNSCHEDULED_TECH_LINK_MS);
}

/**
 * The link belongs to whoever is on the job. Taking a technician off it
 * retires their link, so the next one gets a fresh token and the last one can
 * no longer read the customer's details.
 */
export async function retireTechLink(jobId: string) {
  await prisma.job.update({ where: { id: jobId }, data: { techToken: null } });
}
