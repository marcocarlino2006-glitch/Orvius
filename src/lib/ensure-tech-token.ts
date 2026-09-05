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
