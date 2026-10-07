import { getAppBaseUrl } from "@/lib/domains";
import { prisma } from "@/lib/prisma";
import { mintPublicToken } from "@/lib/public-tokens";

export function techAppUrl(token: string, jobId?: string) {
  return `${getAppBaseUrl()}/tech/${token}${jobId ? `/jobs/${jobId}` : ""}`;
}

/** The technician's app token, minted the first time anyone needs to link them. */
export async function ensureTechAppToken(technicianId: string): Promise<string> {
  const tech = await prisma.technician.findUnique({ where: { id: technicianId }, select: { appToken: true } });
  if (tech?.appToken) return tech.appToken;
  const appToken = mintPublicToken();
  const claimed = await prisma.technician.updateMany({ where: { id: technicianId, appToken: null }, data: { appToken, appTokenAt: new Date() } });
  if (claimed.count) return appToken;
  const raced = await prisma.technician.findUnique({ where: { id: technicianId }, select: { appToken: true } });
  return raced?.appToken ?? appToken;
}

/**
 * A technician row for the browser or an export: whether they have an app
 * link, never the link itself. `appTokenAt` is set and cleared with the token,
 * so rows that never selected the token still answer.
 */
export function publicTechnician<T extends { appToken?: string | null; appTokenAt?: Date | null }>(tech: T) {
  const { appToken, appTokenAt, ...rest } = tech;
  return { ...rest, hasAppLink: Boolean(appToken ?? appTokenAt), appLinkAt: appTokenAt?.toISOString() ?? null };
}
