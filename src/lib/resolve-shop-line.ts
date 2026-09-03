import { prisma } from "@/lib/prisma";
import { logWarn } from "@/lib/logger";
import { normalizePhone } from "@/lib/customer";

type ShopLineMatch = {
  id: string;
  name: string;
  ownerPhone: string | null;
  ownerEmail: string | null;
  twilioPhone: string | null;
  vapiPhoneNumber: string | null;
  vapiAssistantId: string | null;
  lineVerifiedAt: Date | null;
  createdAt: Date;
};

/**
 * Resolve the shop that owns an inbound line.
 * One number → one shop. If DB collisions exist, pick the oldest shop
 * (stable demo/primary owner) and log — never silently fan-out to the wrong tenant.
 */
export async function resolveBusinessByInboundPhone(
  phone: string | null | undefined,
): Promise<ShopLineMatch | null> {
  const normalized = normalizePhone(phone);
  if (!normalized && !phone?.trim()) return null;

  const candidates = [normalized, phone?.trim()].filter(
    (value, index, arr): value is string =>
      Boolean(value) && arr.indexOf(value) === index,
  );

  const matches = await prisma.business.findMany({
    where: {
      isActive: true,
      OR: candidates.flatMap((value) => [
        { twilioPhone: value },
        { vapiPhoneNumber: value },
      ]),
    },
    select: {
      id: true,
      name: true,
      ownerPhone: true,
      ownerEmail: true,
      twilioPhone: true,
      vapiPhoneNumber: true,
      vapiAssistantId: true,
      lineVerifiedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (matches.length === 0) return null;

  if (matches.length > 1) {
    logWarn("tenant.shared_line_collision", {
      phone: normalized ?? phone,
      businessIds: matches.map((m) => m.id),
      names: matches.map((m) => m.name),
      chosen: matches[0].id,
    });
  }

  return matches[0];
}
