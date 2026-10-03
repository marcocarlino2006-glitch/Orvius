import type Stripe from "stripe";
import { recordAudit } from "@/lib/audit";
import { shopHasLivePlan } from "@/lib/billing-sync";
import { linkTouchToCustomer, normalizePhone } from "@/lib/customer";
import { sendCustomerSms } from "@/lib/customer-sms";
import { deriveDemandSignal, tradeForCapture } from "@/lib/demand-capture";
import { logWarn } from "@/lib/logger";
import { enqueueOwnerAlert } from "@/lib/notifications";
import { formatCentsExact } from "@/lib/money";
import { NETWORK_FEE_BPS, networkSenderCreditCents } from "@/lib/platform-fee";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { sendSms } from "@/lib/twilio-sms";

/*
  The Orvius Network: a job one shop can't take goes to a nearby Orvius shop in
  the same trade instead of being lost. The caller is asked first and nothing
  about them is shared until they say yes. The first shop to reply TAKE gets it.
*/

export type NetworkTexts = { toCustomer: typeof sendCustomerSms; toOwner: typeof sendSms };
const liveTexts: NetworkTexts = { toCustomer: sendCustomerSms, toOwner: sendSms };

const ASK_WINDOW_MS = 48 * 60 * 60 * 1000;
const OFFER_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_OFFERS = 3;

/** First three ZIP digits — one postal region, the network's unit of "nearby". */
export function zip3From(text: string | null | undefined): string | null {
  if (!text) return null;
  const zips = [...text.matchAll(/\b(\d{5})(?:-\d{4})?\b/g)];
  return zips.length ? zips[zips.length - 1][1].slice(0, 3) : null;
}

const WORD_END = "(?=$|[\\s,.!?])";
const YES = new RegExp(`^\\s*(yes|y|yeah|yep|sure|ok|okay|please|si|sí)${WORD_END}`, "i");
const NO = new RegExp(`^\\s*(no|n|nope|nah)${WORD_END}`, "i");
export const isYes = (body: string) => YES.test(body);
export const isNo = (body: string) => NO.test(body);

type PartnerShop = {
  id: string;
  name: string;
  ownerPhone: string | null;
  vapiPhoneNumber: string | null;
  twilioPhone: string | null;
  phone: string | null;
};

/** Paying, opted-in shops in the trade and region, least recently offered first. */
export async function findNetworkPartners(params: {
  trade: string;
  zip3: string;
  excludeBusinessId: string;
  limit?: number;
}): Promise<PartnerShop[]> {
  const shops = await prisma.business.findMany({
    where: {
      networkOn: true,
      networkZip3: params.zip3,
      trade: params.trade,
      isActive: true,
      environment: "production",
      id: { not: params.excludeBusinessId },
      ownerPhone: { not: null },
      ownerSmsOptOutAt: null,
      stripeSubscriptionId: { not: null },
      billingStatus: { in: ["active", "past_due"] },
    },
    select: { id: true, name: true, ownerPhone: true, vapiPhoneNumber: true, twilioPhone: true, phone: true },
    take: 50,
  });
  if (shops.length <= (params.limit ?? MAX_OFFERS)) return shops;

  const recent = await prisma.networkHandoff.findMany({
    where: { status: { in: ["offered", "taken"] }, offeredAt: { gte: new Date(Date.now() - 30 * 86_400_000) }, zip3: params.zip3 },
    select: { offeredToJson: true },
    take: 500,
  });
  const offers = new Map<string, number>();
  for (const row of recent) {
    for (const id of JSON.parse(row.offeredToJson) as string[]) offers.set(id, (offers.get(id) ?? 0) + 1);
  }
  return [...shops].sort((a, b) => (offers.get(a.id) ?? 0) - (offers.get(b.id) ?? 0)).slice(0, params.limit ?? MAX_OFFERS);
}

type SenderShop = { id: string; name: string; trade: string | null; address: string | null; networkOn: boolean };
type PassLead = {
  id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  postalCode: string | null;
  job: unknown;
};

/** Owner replied PASS: ask the caller whether a nearby shop may reach out. */
export async function passLeadToNetwork(shop: SenderShop, lead: PassLead, texts: NetworkTexts = liveTexts): Promise<string> {
  const who = lead.name?.trim() || lead.phone || "the customer";
  if (!shop.networkOn) return "Turn on the Orvius Network in Settings → Business to pass jobs to nearby shops.";
  if (lead.job) return `${who} already has a job on the board. Cancel it in the app first if you can't do it.`;
  const callerPhone = normalizePhone(lead.phone);
  if (!callerPhone || !lead.phone) return `No number on file for ${who}, so the network can't reach them.`;
  if (!shop.trade) return "Set your trade in Settings → Business first.";
  const zip3 = zip3From(lead.postalCode) ?? zip3From(lead.address) ?? zip3From(shop.address);
  if (!zip3) return `No ZIP code for ${who}'s job, so the network can't find a shop nearby.`;

  const existing = await prisma.networkHandoff.findUnique({ where: { leadId: lead.id } });
  if (existing) return `${who} was already offered to the network.`;

  const partners = await findNetworkPartners({ trade: shop.trade, zip3, excludeBusinessId: shop.id });
  if (!partners.length) {
    return `No other Orvius ${shop.trade} shop near ${zip3}xx yet. Reply TEXT <message> to tell ${who} yourself.`;
  }

  const sent = await texts.toCustomer({
    businessId: shop.id,
    to: lead.phone,
    body: `${shop.name} can't take this job. Want us to have another local ${shop.trade.toLowerCase()} pro from the Orvius Network reach out? Reply YES and we'll share your name, number and the problem with them only.`,
  });
  if (!sent.sent) {
    return sent.reason === "customer_opted_out"
      ? `${who} has opted out of texts, so the network can't ask them.`
      : `Couldn't text ${who}. Call them at ${lead.phone}.`;
  }
  await prisma.networkHandoff.create({
    data: { fromBusinessId: shop.id, leadId: lead.id, callerPhone: lead.phone, callerPhoneNormalized: callerPhone, trade: shop.trade, zip3 },
  });
  await recordAudit({
    businessId: shop.id,
    entityType: "lead",
    entityId: lead.id,
    leadId: lead.id,
    action: "network.asked",
    actor: "owner",
    summary: `Owner passed ${who} to the Orvius Network. Asked the caller first.`,
    detail: { zip3, partners: partners.length },
  });
  return `Asked ${who} if a nearby Orvius shop can reach out. If they say yes, it goes to the first shop that takes it.`;
}

/** A caller's reply to the network question. Null when there is no open question or it isn't a yes or no. */
export async function answerNetworkConsent(params: {
  business: { id: string; name: string };
  from: string;
  body: string;
  now?: Date;
}, texts: NetworkTexts = liveTexts): Promise<string | null> {
  const phone = normalizePhone(params.from);
  if (!phone) return null;
  const now = params.now ?? new Date();
  const handoff = await prisma.networkHandoff.findFirst({
    where: {
      fromBusinessId: params.business.id,
      callerPhoneNormalized: phone,
      status: "asking",
      askedAt: { gte: new Date(now.getTime() - ASK_WINDOW_MS) },
    },
    orderBy: { askedAt: "desc" },
  });
  if (!handoff) return null;

  if (isNo(params.body)) {
    await prisma.networkHandoff.update({ where: { id: handoff.id }, data: { status: "declined" } });
    return `No problem. ${params.business.name} has your details if anything changes.`;
  }
  if (!isYes(params.body)) return null;

  const partners = await findNetworkPartners({ trade: handoff.trade, zip3: handoff.zip3, excludeBusinessId: handoff.fromBusinessId });
  const claimed = await prisma.networkHandoff.updateMany({
    where: { id: handoff.id, status: "asking" },
    data: partners.length
      ? { status: "offered", offeredAt: now, offeredToJson: JSON.stringify(partners.map((p) => p.id)) }
      : { status: "none" },
  });
  if (claimed.count === 0) return null;
  if (!partners.length) return `Sorry, no nearby shop is free right now. ${params.business.name} has your details.`;

  const lead = await prisma.lead.findUnique({
    where: { id: handoff.leadId },
    select: { serviceType: true, urgency: true, name: true },
  });
  const what = [lead?.urgency, lead?.serviceType].filter(Boolean).join(" · ") || "Service request";
  const first = lead?.name?.trim().split(/\s+/)[0];
  await Promise.all(
    partners.map((partner) =>
      texts.toOwner({
        to: partner.ownerPhone!,
        businessId: partner.id,
        audience: "owner",
        body: `Orvius Network job near ${handoff.zip3}xx: ${what}${first ? ` for ${first}` : ""}. Another shop couldn't take it and the customer asked for a pro. Reply TAKE to get it. First to reply gets it. Network jobs carry a ${NETWORK_FEE_BPS / 100}% Orvius fee when the customer pays the bill by card.`,
      }).catch((error: unknown) => {
        logWarn("network.offer_sms_failed", { handoffId: handoff.id, partnerId: partner.id, error: error instanceof Error ? error.message : "unknown" });
        return null;
      }),
    ),
  );
  return "Thanks. A nearby pro from the Orvius Network will reach out shortly.";
}

/** Partner owner replied TAKE: the first one gets the customer as a new lead. Null when nothing is on offer. */
export async function takeNetworkJob(
  shop: { id: string; name: string },
  now = new Date(),
  texts: NetworkTexts = liveTexts,
): Promise<string | null> {
  const offers = await prisma.networkHandoff.findMany({
    where: { status: { in: ["offered", "taken"] }, offeredAt: { gte: new Date(now.getTime() - OFFER_WINDOW_MS) } },
    orderBy: { offeredAt: "desc" },
    take: 50,
  });
  const mine = offers.filter((h) => (JSON.parse(h.offeredToJson) as string[]).includes(shop.id));
  if (!mine.length) return null;
  const open = mine.find((h) => h.status === "offered");
  if (!open) return mine[0].toBusinessId === shop.id ? "That job is already yours. Reply BOOK to book it." : "Another shop already took that job.";

  const claimed = await prisma.networkHandoff.updateMany({
    where: { id: open.id, status: "offered" },
    data: { status: "taken", toBusinessId: shop.id, takenAt: now },
  });
  if (claimed.count === 0) return "Another shop already took that job.";

  const [source, sender] = await Promise.all([
    prisma.lead.findUnique({ where: { id: open.leadId } }),
    prisma.business.findUnique({ where: { id: open.fromBusinessId }, select: { id: true, name: true, ownerPhone: true } }),
  ]);
  const partner = await prisma.business.findUnique({
    where: { id: shop.id },
    select: { id: true, name: true, ownerPhone: true, ownerEmail: true, vapiPhoneNumber: true, twilioPhone: true, phone: true },
  });
  if (!source || !partner) return "That job is no longer available.";

  const demand = deriveDemandSignal({
    serviceType: source.serviceType,
    notes: source.notes,
    address: source.address,
    categoryHint: source.categoryCode,
    trade: tradeForCapture({ trade: open.trade }),
  });
  const lead = await prisma.lead.create({
    data: {
      businessId: partner.id,
      name: source.name,
      phone: open.callerPhone,
      email: source.email,
      address: source.address,
      serviceType: source.serviceType,
      urgency: source.urgency,
      categoryCode: demand.categoryCode,
      postalCode: demand.postalCode ?? source.postalCode,
      notes: [`From the Orvius Network: ${sender?.name ?? "another shop"} couldn't take it and the customer asked for a pro.`, source.notes]
        .filter(Boolean)
        .join("\n"),
      source: "network",
      status: "new",
    },
  });
  await prisma.networkHandoff.update({ where: { id: open.id }, data: { toLeadId: lead.id } });
  await prisma.lead
    .updateMany({ where: { id: source.id, status: { in: ["new", "contacted"] } }, data: { status: "lost", closedAt: now } })
    .catch(() => null);
  await linkTouchToCustomer({ businessId: partner.id, leadId: lead.id, phone: open.callerPhone, notes: source.notes ?? "" }).catch(() => null);
  await recordAudit({
    businessId: partner.id,
    entityType: "lead",
    entityId: lead.id,
    leadId: lead.id,
    action: "network.taken",
    actor: "owner",
    summary: `Took a job from the Orvius Network, passed by ${sender?.name ?? "another shop"}.`,
    detail: { handoffId: open.id, fromBusinessId: open.fromBusinessId },
  });

  const who = source.name?.trim() || open.callerPhone;
  const partnerLine = partner.vapiPhoneNumber ?? partner.twilioPhone ?? partner.phone;
  await texts.toCustomer({
    businessId: partner.id,
    to: open.callerPhone,
    body: `${partner.name} from the Orvius Network has your request and will reach out shortly.${partnerLine ? ` You can also call them at ${partnerLine}.` : ""}`,
  }).catch(() => null);
  await enqueueOwnerAlert({
    businessId: partner.id,
    leadId: lead.id,
    ownerPhone: partner.ownerPhone,
    ownerEmail: partner.ownerEmail,
    businessName: partner.name,
    dedupeKey: `network-taken:${open.id}`,
    message: [
      `Network job · ${[source.urgency, source.serviceType].filter(Boolean).join(" · ") || "Service request"}`,
      who,
      source.address,
      open.callerPhone,
    ]
      .filter(Boolean)
      .join("\n"),
  });
  if (sender?.ownerPhone) {
    await texts.toOwner({
      to: sender.ownerPhone,
      businessId: sender.id,
      audience: "owner",
      body: `Orvius: ${who} went to ${partner.name} through the Orvius Network.`,
    }).catch(() => null);
  }
  return `It's yours: ${who}. The details are in your next text. Reply BOOK to book it.`;
}

type CreditStripe = { customers: Pick<Stripe.CustomersResource, "createBalanceTransaction"> };

/**
 * The receiving shop was paid for a network job: the shop that passed it gets
 * its share of the network fee as credit on its Orvius bill. Claimed before the
 * Stripe call, so a retried webhook cannot credit twice.
 */
export async function creditNetworkSender(
  params: { jobId: string; amountCents: number },
  deps: { stripe?: CreditStripe; notify?: typeof sendSms } = {},
) {
  const job = await prisma.job.findUnique({
    where: { id: params.jobId },
    select: { leadId: true, business: { select: { name: true } } },
  });
  if (!job?.leadId) return { status: "skipped" as const };
  const handoff = await prisma.networkHandoff.findFirst({
    where: { toLeadId: job.leadId, status: "taken", creditStatus: null },
  });
  if (!handoff) return { status: "skipped" as const };

  const sender = await prisma.business.findUnique({
    where: { id: handoff.fromBusinessId },
    select: { id: true, name: true, ownerPhone: true, stripeCustomerId: true, stripeSubscriptionId: true, billingStatus: true, billingPlan: true },
  });
  const creditCents = networkSenderCreditCents(params.amountCents);
  if (!sender || !sender.stripeCustomerId || !shopHasLivePlan(sender) || creditCents < 100) {
    await prisma.networkHandoff.updateMany({ where: { id: handoff.id, creditStatus: null }, data: { creditStatus: "void" } });
    return { status: "void" as const };
  }

  const claimed = await prisma.networkHandoff.updateMany({
    where: { id: handoff.id, creditStatus: null },
    data: { creditStatus: "crediting" },
  });
  if (claimed.count === 0) return { status: "skipped" as const };

  try {
    await (deps.stripe ?? getStripe()).customers.createBalanceTransaction(
      sender.stripeCustomerId,
      {
        amount: -creditCents,
        currency: "usd",
        description: `Orvius Network credit: a job you passed to ${job.business.name}`,
        metadata: { networkHandoffId: handoff.id },
      },
      { idempotencyKey: `network-credit:${handoff.id}` },
    );
  } catch (error) {
    await prisma.networkHandoff.update({ where: { id: handoff.id }, data: { creditStatus: null } });
    throw error;
  }

  await prisma.networkHandoff.update({
    where: { id: handoff.id },
    data: { creditStatus: "credited", creditCents, creditedAt: new Date() },
  });
  const credit = formatCentsExact(creditCents);
  await recordAudit({
    businessId: sender.id,
    entityType: "shop",
    entityId: sender.id,
    action: "network.credited",
    actor: "system",
    summary: `${job.business.name} was paid for a job you passed. ${credit} credited to your next bill.`,
    detail: { networkHandoffId: handoff.id, creditCents },
    idempotencyKey: `network-credit:${handoff.id}`,
  });
  if (sender.ownerPhone) {
    await (deps.notify ?? sendSms)({
      to: sender.ownerPhone,
      businessId: sender.id,
      audience: "owner",
      body: `Orvius Network: ${job.business.name} finished the job you passed and got paid. ${credit} is credited to your next Orvius bill.`,
    }).catch(() => null);
  }
  return { status: "credited" as const, creditCents };
}
