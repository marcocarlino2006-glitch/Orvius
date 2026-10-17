import { prisma } from "@/lib/prisma";
import { logError, logWarn } from "@/lib/logger";
import { normalizePhone } from "@/lib/customer";
import { isDemoBusiness, isDemoPlatformLine, workspaceEnvironment } from "@/lib/demo-business";

const SHOP_LINE_SELECT = {
  id: true,
  name: true,
  slug: true,
  environment: true,
  timezone: true,
  ownerPhone: true,
  ownerEmail: true,
  transferPhone: true,
  twilioPhone: true,
  vapiPhoneNumber: true,
  vapiAssistantId: true,
  lineVerifiedAt: true,
  billingStatus: true,
  pilotEndsAt: true,
  pastDueSince: true,
  createdAt: true,
  trade: true,
  address: true,
  networkOn: true,
} as const;

/** A reply this long after our last text to that phone is a new conversation. */
const REPLY_WINDOW_DAYS = 30;

type ShopLineMatch = {
  id: string;
  name: string;
  slug: string;
  environment: string;
  timezone: string;
  ownerPhone: string | null;
  ownerEmail: string | null;
  transferPhone: string | null;
  twilioPhone: string | null;
  vapiPhoneNumber: string | null;
  vapiAssistantId: string | null;
  lineVerifiedAt: Date | null;
  billingStatus: string;
  pilotEndsAt: Date | null;
  pastDueSince: Date | null;
  createdAt: Date;
  trade: string | null;
  address: string | null;
  networkOn: boolean;
};

type TenantCandidate = { id: string; slug: string; name: string; environment: string | null; createdAt: Date };

/**
 * One owner for a line or assistant that several active shops claim.
 * The demo line goes to a demo shop. Otherwise a single live customer shop
 * wins over demo and test shops; when only demo or test shops collide the
 * oldest keeps it. Two live customer shops on one key is a provisioning
 * error, and guessing would put one shop's caller in another's records, so
 * nobody gets it and the collision is logged for the founder to fix.
 */
export function pickTenant<T extends TenantCandidate>(
  matches: T[],
  context: { kind: "line" | "assistant"; key: string },
): T | null {
  if (matches.length <= 1) return matches[0] ?? null;
  const ordered = [...matches].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const fields = { kind: context.kind, key: context.kind === "line" ? redactKey(context.key) : context.key, businessIds: ordered.map((m) => m.id) };

  if (context.kind === "line" && isDemoPlatformLine(context.key)) {
    const demo = ordered.find((m) => isDemoBusiness(m));
    if (demo) {
      logWarn("tenant.shared_line_collision", { ...fields, chosen: demo.id, rule: "demo_line" });
      return demo;
    }
  }

  const live = ordered.filter((m) => workspaceEnvironment(m.environment) === "production" && !isDemoBusiness(m));
  if (live.length === 1) {
    logWarn("tenant.shared_line_collision", { ...fields, chosen: live[0].id, rule: "single_live_shop" });
    return live[0];
  }
  if (live.length === 0) {
    logWarn("tenant.shared_line_collision", { ...fields, chosen: ordered[0].id, rule: "oldest_non_live" });
    return ordered[0];
  }
  logError("tenant.ambiguous_owner", { ...fields, liveBusinessIds: live.map((m) => m.id) });
  return null;
}

function redactKey(value: string) {
  return value.length > 4 ? `…${value.slice(-4)}` : value;
}

/**
 * Resolve the shop that owns an inbound line. See pickTenant for collisions.
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
    select: SHOP_LINE_SELECT,
    orderBy: { createdAt: "asc" },
  });

  return pickTenant(matches, { kind: "line", key: normalized || phone!.trim() });
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
    const recent = await prisma.outboundSms.findMany({
      where: {
        toNormalized: fromNormalized,
        createdAt: { gte: since },
        business: { isActive: true },
      },
      orderBy: { createdAt: "desc" },
      distinct: ["businessId"],
      take: 2,
      select: { business: { select: SHOP_LINE_SELECT } },
    });
    if (recent.length > 1) {
      logWarn("tenant.sms_reply_two_shops", {
        chosen: recent[0].business.id,
        alsoTexted: recent[1].business.id,
        rule: "most_recent_sender",
      });
    }
    if (recent[0]) return recent[0].business;
  }

  return direct;
}
