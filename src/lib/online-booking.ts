import type { Business } from "@prisma/client";
import { isBillingEntitled } from "@/lib/billing-entitlement";
import { deriveDemandSignal, tradeForCapture } from "@/lib/demand-capture";
import { linkTouchToCustomer, normalizePhone } from "@/lib/customer";
import { isTextableNumber } from "@/lib/sms-destination";
import { sendCustomerConfirmSms } from "@/lib/customer-confirm";
import { recordMarketingOptIn } from "@/lib/marketing-consent";
import { createJobFromLead, findOpenSlots } from "@/lib/job";
import { logWarn } from "@/lib/logger";
import { buildLeadAlertDedupeKey, enqueueOwnerAlert } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { formatShopTime, safeTimezone } from "@/lib/availability";
import { classifyRequest, parseServiceOverrides, resolveTrade, TRADE_PLAYBOOKS } from "@/lib/trade-playbooks";

/**
 * The shop's public booking page (/b/[slug]): a customer picks a service and
 * one of the same open times the receptionist would offer on a call, and it
 * lands as a booked job with the usual confirmation text. Off until the owner
 * turns it on, and only while the workspace is paid up.
 */

/** Enough candidates to fill a week; then each day is capped so the page spans days, not one morning. */
const BOOKING_SLOT_SCAN = 200;
export const BOOKING_SLOTS_PER_DAY = 8;
export const BOOKING_DAYS = 7;
const BOOKING_SLOT_GAP_MIN = 30;
const MAX_SERVICES = 12;

type BookingShop = Pick<
  Business,
  | "id"
  | "name"
  | "slug"
  | "trade"
  | "servicesJson"
  | "hoursJson"
  | "timezone"
  | "isActive"
  | "environment"
  | "bookingPageOn"
  | "webChatOn"
  | "billingStatus"
  | "pilotEndsAt"
  | "pastDueSince"
  | "createdAt"
  | "ownerPhone"
  | "ownerEmail"
  | "vapiPhoneNumber"
  | "twilioPhone"
>;

const SHOP_SELECT = {
  id: true,
  name: true,
  slug: true,
  trade: true,
  servicesJson: true,
  hoursJson: true,
  timezone: true,
  isActive: true,
  environment: true,
  bookingPageOn: true,
  webChatOn: true,
  billingStatus: true,
  pilotEndsAt: true,
  pastDueSince: true,
  createdAt: true,
  ownerPhone: true,
  ownerEmail: true,
  vapiPhoneNumber: true,
  twilioPhone: true,
} as const;

export type PublicShop = BookingShop;

/** A shop's public page (booking or web chat), only when the owner turned it on and the workspace is paid. */
export async function publicShop(slug: string, feature: "bookingPageOn" | "webChatOn"): Promise<PublicShop | null> {
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) return null;
  const shop = await prisma.business.findUnique({ where: { slug }, select: SHOP_SELECT });
  if (!shop || !shop[feature] || !shop.isActive || shop.environment === "test") return null;
  if (!isBillingEntitled(shop)) return null;
  return shop;
}

/** Who a customer can still call when a shop's public page is off. */
export async function shopContact(slug: string): Promise<{ name: string; phone: string | null } | null> {
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) return null;
  const shop = await prisma.business.findUnique({
    where: { slug },
    select: { name: true, isActive: true, environment: true, vapiPhoneNumber: true, twilioPhone: true },
  });
  if (!shop || !shop.isActive || shop.environment === "test") return null;
  return { name: shop.name, phone: shop.vapiPhoneNumber ?? shop.twilioPhone ?? null };
}

export function bookableShop(slug: string) {
  return publicShop(slug, "bookingPageOn");
}

export function bookingServices(shop: Pick<Business, "servicesJson" | "trade" | "name">): string[] {
  const own = parseServiceOverrides(shop.servicesJson)
    .map((s) => s.name?.trim())
    .filter((name): name is string => Boolean(name));
  if (own.length) return [...new Set(own)].slice(0, MAX_SERVICES);
  const trade = resolveTrade(shop);
  const playbook = trade ? TRADE_PLAYBOOKS[trade] : null;
  if (!playbook) return ["Appointment"];
  return [...playbook.services.map((s) => s.label), playbook.fallback.label].slice(0, MAX_SERVICES);
}

function shape(shop: BookingShop, serviceType: string) {
  const playbook = classifyRequest({ business: shop, serviceType, urgency: null });
  return {
    businessId: shop.id,
    urgency: null,
    durationMin: playbook.service.durationMin,
    skill: playbook.service.skill,
    hoursJson: shop.hoursJson,
    timezone: shop.timezone ?? "America/New_York",
  };
}

export async function bookingSlots(shop: BookingShop, serviceType: string) {
  const timezone = shop.timezone ?? "America/New_York";
  const slots = await findOpenSlots(shape(shop, serviceType), {
    count: BOOKING_SLOT_SCAN,
    minGapMin: BOOKING_SLOT_GAP_MIN,
  });
  const dayOf = new Intl.DateTimeFormat("en-CA", { timeZone: safeTimezone(timezone), year: "numeric", month: "2-digit", day: "2-digit" });
  const byDay = new Map<string, Date[]>();
  for (const at of slots) {
    const day = dayOf.format(at);
    if (!byDay.has(day) && byDay.size >= BOOKING_DAYS) break;
    byDay.set(day, [...(byDay.get(day) ?? []), at]);
  }
  // Spread each day's picks from morning to close rather than the first hours only.
  const picked = [...byDay.values()].flatMap((day) => {
    if (day.length <= BOOKING_SLOTS_PER_DAY) return day;
    const step = (day.length - 1) / (BOOKING_SLOTS_PER_DAY - 1);
    return [...new Set(Array.from({ length: BOOKING_SLOTS_PER_DAY }, (_, i) => Math.round(i * step)))].map((i) => day[i]);
  });
  return picked.map((at) => ({ at: at.toISOString(), label: formatShopTime(at, timezone) }));
}

export type BookingInput = {
  serviceType: string;
  at: string;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  /** The optional, unticked-by-default promotional texts box. */
  marketingOptIn?: boolean;
};

export type BookingResult =
  | { ok: true; jobId: string; scheduledAt: string; label: string; confirmTextSent: boolean }
  | { ok: false; reason: "bad_phone" | "bad_service" | "bad_time" | "slot_taken" | "safety"; message: string };

export async function bookOnline(shop: BookingShop, input: BookingInput): Promise<BookingResult> {
  const phone = normalizePhone(input.phone);
  if (!phone || !isTextableNumber(phone)) {
    return { ok: false, reason: "bad_phone", message: "Enter a US or Canadian mobile number we can text the confirmation to." };
  }
  const services = bookingServices(shop);
  if (!services.includes(input.serviceType)) {
    return { ok: false, reason: "bad_service", message: "Pick one of the services listed." };
  }
  const at = new Date(input.at);
  if (Number.isNaN(at.getTime()) || at.getTime() < Date.now()) {
    return { ok: false, reason: "bad_time", message: "Pick one of the open times." };
  }

  const classification = classifyRequest({ business: shop, serviceType: input.serviceType, notes: input.notes, urgency: null });
  if (classification.safety) {
    return {
      ok: false,
      reason: "safety",
      message: `This sounds urgent (${classification.safety.label.toLowerCase()}). If anyone is in danger, call 911. Otherwise please call ${shop.name} directly${shop.vapiPhoneNumber ? ` at ${shop.vapiPhoneNumber}` : ""}.`,
    };
  }

  const slot = shape(shop, input.serviceType);
  if (!(await findOpenSlots(slot, { count: 1, onlyAt: at })).length) {
    return { ok: false, reason: "slot_taken", message: "That time was just taken. Pick another." };
  }

  const name = input.name.trim().slice(0, 120);
  const demand = deriveDemandSignal({
    serviceType: input.serviceType,
    notes: input.notes,
    address: input.address,
    trade: tradeForCapture(shop),
  });
  const lead = await prisma.lead.create({
    data: {
      businessId: shop.id,
      name,
      phone,
      email: input.email?.trim().toLowerCase().slice(0, 200) || null,
      address: input.address?.trim().slice(0, 300) || null,
      notes: input.notes?.trim().slice(0, 1000) || null,
      serviceType: input.serviceType,
      source: "web",
      status: "new",
      categoryCode: demand.categoryCode,
      postalCode: demand.postalCode,
    },
  });
  await linkTouchToCustomer({
    businessId: shop.id,
    leadId: lead.id,
    phone,
    name,
    email: lead.email,
    address: lead.address,
    notes: lead.notes,
  });
  if (input.marketingOptIn === true) {
    await recordMarketingOptIn({ businessId: shop.id, phone, source: "booking_page" });
  }
  const job = await createJobFromLead({ leadId: lead.id, scheduledAt: at, actor: "system" });

  /*
    Checking and then booking is a race between two visitors on the same time.
    Re-check with this job left out: if the time no longer has room, someone
    else landed first and this booking yields rather than double-book a person.
  */
  const stillFits = await findOpenSlots({ ...slot, excludeJobId: job.id }, { count: 1, onlyAt: at });
  if (!stillFits.length) {
    await prisma.job.update({ where: { id: job.id }, data: { status: "cancelled" } });
    await prisma.lead.update({ where: { id: lead.id }, data: { status: "new", closedAt: null } });
    return { ok: false, reason: "slot_taken", message: "That time was just taken. Pick another." };
  }

  const label = formatShopTime(at, shop.timezone ?? "America/New_York");
  await recordAudit({
    businessId: shop.id,
    entityType: "job",
    entityId: job.id,
    jobId: job.id,
    leadId: lead.id,
    action: "job.booked_online",
    actor: "system",
    summary: `Booked online — ${input.serviceType}, ${label}`,
    idempotencyKey: `web-booking:${lead.id}`,
  });

  let confirmTextSent = false;
  try {
    confirmTextSent = (await sendCustomerConfirmSms(job.id)).sent;
  } catch (error) {
    logWarn("online_booking.confirm_failed", { jobId: job.id, error: error instanceof Error ? error.message : "unknown" });
  }

  await enqueueOwnerAlert({
    businessId: shop.id,
    ownerPhone: shop.ownerPhone,
    ownerEmail: shop.ownerEmail,
    businessName: shop.name,
    leadId: lead.id,
    message: `Booked online: ${name} · ${input.serviceType} · ${label}\n${phone}${lead.address ? `\n${lead.address}` : ""}${lead.notes ? `\n“${lead.notes}”` : ""}`,
    dedupeKey: buildLeadAlertDedupeKey({ leadId: lead.id }),
  });

  return { ok: true, jobId: job.id, scheduledAt: at.toISOString(), label, confirmTextSent };
}
