import { prisma } from "@/lib/prisma";
import { logWarn } from "@/lib/logger";
import { normalizePhone } from "@/lib/customer";
import { isDemoPlatformLine } from "@/lib/demo-business";

const SHOP_LINE_SELECT = {
  id: true,
  name: true,
  timezone: true,
  ownerPhone: true,
  ownerEmail: true,
  twilioPhone: true,
  vapiPhoneNumber: true,
  vapiAssistantId: true,
  lineVerifiedAt: true,
  billingStatus: true,
  createdAt: true,
} as const;

/** A reply this long after our last text to that phone is a new conversation. */
const REPLY_WINDOW_DAYS = 30;

type ShopLineMatch = {
  id: string;
  name: string;
  timezone: string;
  ownerPhone: string | null;
  ownerEmail: string | null;
  twilioPhone: string | null;
  vapiPhoneNumber: string | null;
  vapiAssistantId: string | null;
  lineVerifiedAt: Date | null;
  billingStatus: string;
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
      timezone: true,
      ownerPhone: true,
      ownerEmail: true,
      twilioPhone: true,
      vapiPhoneNumber: true,
      vapiAssistantId: true,
      lineVerifiedAt: true,
      billingStatus: true,
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

/**
 * The shop an inbound text belongs to.
 *
 * A text to a shop's own line belongs to that shop. Everything Orvius sends
 * goes out from the shared sender (the platform line or the messaging-service
 * pool), so a text arriving there is a reply, and it belongs to whichever shop
 * last texted that phone. Only when no shop has, does it fall to the owner of
 * the number it arrived on (the demo shop for the platform line).
 */
export async function resolveBusinessForInboundSms(params: {
  to: string;
  from: string;
  now?: Date;
}): Promise<ShopLineMatch | null> {
  const direct = await resolveBusinessByInboundPhone(params.to);
  if (direct && !isDemoPlatformLine(params.to)) return direct;

  const fromNormalized = normalizePhone(params.from);
  if (fromNormalized) {
    const since = new Date((params.now ?? new Date()).getTime() - REPLY_WINDOW_DAYS * 86_400_000);
    const last = await prisma.outboundSms.findFirst({
      where: {
        toNormalized: fromNormalized,
        createdAt: { gte: since },
        business: { isActive: true },
      },
      orderBy: { createdAt: "desc" },
      select: { business: { select: SHOP_LINE_SELECT } },
    });
    if (last) return last.business;
  }

  return direct;
}
