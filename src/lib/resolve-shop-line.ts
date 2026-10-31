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
  greeting: true,
  lineVerifiedAt: true,
  billingStatus: true,
  pilotEndsAt: true,
  pastDueSince: true,
  createdAt: true,
  trade: true,
  address: true,
  networkOn: true,
  hoursJson: true,
  closedDatesJson: true,
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
  greeting: string | null;
  lineVerifiedAt: Date | null;
  billingStatus: string;
  pilotEndsAt: Date | null;
  pastDueSince: Date | null;
  createdAt: Date;
  trade: string | null;
  address: string | null;
  networkOn: boolean;
  hoursJson: string;
  closedDatesJson: string | null;
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

export type InboundSmsOwner =
  | { kind: "shop"; business: ShopLineMatch; clarified?: boolean }
  | { kind: "ambiguous"; candidates: ShopLineMatch[] }
  | { kind: "none" };

const LEGAL_SUFFIX = /\b(llc|inc|co|corp|company|ltd)\b/g;

function plainWords(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** The one candidate a customer's text names, or null when it names none or several. */
export function namedCandidate<T extends { name: string }>(body: string | undefined, candidates: T[]): T | null {
  if (!body) return null;
  const text = ` ${plainWords(body)} `;
  const hits = candidates
    .map((c) => {
      const full = plainWords(c.name);
      const bare = full.replace(LEGAL_SUFFIX, " ").replace(/\s+/g, " ").trim();
      const said = [full, bare].filter((n) => n.length >= 3 && text.includes(` ${n} `)).sort((x, y) => y.length - x.length)[0];
      return said ? { c, said } : null;
    })
    .filter((h): h is { c: T; said: string } => h !== null)
    .sort((x, y) => y.said.length - x.said.length);
  if (!hits.length) return null;
  /* "Cool Air Pros" also contains "Cool Air"; the longer name is what was said. */
  const [top, ...rest] = hits;
  return rest.every((h) => ` ${top.said} `.includes(` ${h.said} `) && h.said !== top.said) ? top.c : null;
}

/**
 * Who an inbound text belongs to.
 *
 * A text to a shop's own line belongs to that shop. Everything Orvius sends
 * goes out from the shared sender (the platform line or the messaging-service
 * pool), so a text arriving there is a reply to whichever shop texted that
 * phone in the last 30 days. When two or more shops did, the reply is
 * ambiguous: it belongs to one of them only if it comes from that shop's
 * owner or names that shop; otherwise guessing would hand one shop's customer
 * to another, so the caller holds it. With no recent sender it falls to the
 * owner of the number it arrived on (the demo shop for the platform line).
 */
export async function resolveInboundSmsOwner(params: {
  to: string;
  from: string;
  body?: string;
  now?: Date;
}): Promise<InboundSmsOwner> {
  const direct = await resolveBusinessByInboundPhone(params.to);
  if (direct && !isDemoPlatformLine(params.to)) return { kind: "shop", business: direct };

  const fromNormalized = normalizePhone(params.from);
  if (fromNormalized) {
    const since = new Date((params.now ?? new Date()).getTime() - REPLY_WINDOW_DAYS * 86_400_000);
    const arrivedOn = normalizePhone(params.to);
    const recent = await prisma.outboundSms.findMany({
      where: {
        toNormalized: fromNormalized,
        createdAt: { gte: since },
        business: { isActive: true },
        // A reply comes back to the number that texted; rows from before senders were kept match any number.
        ...(arrivedOn ? { OR: [{ fromNormalized: arrivedOn }, { fromNormalized: null }] } : {}),
      },
      orderBy: { createdAt: "desc" },
      distinct: ["businessId"],
      take: 5,
      select: { business: { select: SHOP_LINE_SELECT } },
    });
    const shops = recent.map((r) => r.business);
    if (shops.length === 1) return { kind: "shop", business: shops[0] };
    if (shops.length > 1) {
      const owner = shops.filter((s) => normalizePhone(s.ownerPhone) === fromNormalized);
      if (owner.length === 1) return { kind: "shop", business: owner[0] };
      const named = namedCandidate(params.body, shops);
      if (named) return { kind: "shop", business: named, clarified: true };
      logWarn("tenant.sms_reply_ambiguous", {
        from: redactKey(fromNormalized),
        businessIds: shops.map((s) => s.id),
        rule: "held",
      });
      return { kind: "ambiguous", candidates: shops };
    }
  }

  return direct ? { kind: "shop", business: direct } : { kind: "none" };
}

/** The shop an inbound text belongs to; null when none does or ownership is ambiguous. */
export async function resolveBusinessForInboundSms(params: {
  to: string;
  from: string;
  body?: string;
  now?: Date;
}): Promise<ShopLineMatch | null> {
  const owner = await resolveInboundSmsOwner(params);
  return owner.kind === "shop" ? owner.business : null;
}
