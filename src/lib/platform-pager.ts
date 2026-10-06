import { isEmailConfigured, sendOwnerEmail } from "@/lib/email";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { captureServerMessage } from "@/lib/sentry-report";
import { sendSms } from "@/lib/twilio-sms";

/*
  Failures that hit every shop at once — Vapi unreachable or out of credit,
  the database gone, the Twilio account suspended — page the founder directly.
  Text and email both go, because the thing that broke may be one of them, and
  Sentry is only a third copy: with no DSN set it was the only one.
*/

export type PlatformFailure = "vapi_unreachable" | "vapi_billing" | "db_unreachable" | "twilio_account" | "spend_ceiling";

const HEADLINE: Record<PlatformFailure, string> = {
  vapi_unreachable: "Vapi is not answering calls. Shop lines are going to the backup voicemail.",
  vapi_billing: "Vapi refused a call for billing (credits or subscription). Every shop's line may be down.",
  db_unreachable: "The database is unreachable from the call path.",
  twilio_account: "Twilio rejected a send at the account level (suspended or bad credentials). Owner alerts are not going out.",
  spend_ceiling: "A shop passed its daily call ceiling; new calls on that line are being ended to cap the Vapi bill. Check for a robodialer or a call loop.",
};

/** One page per failure kind per quarter hour, however many calls hit it. */
const REPAGE_MS = 15 * 60_000;

async function claimPage(kind: PlatformFailure, now: Date) {
  const name = `page:${kind}`;
  const before = new Date(now.getTime() - REPAGE_MS);
  try {
    await prisma.cronRun.create({ data: { name, lastClaimAt: now } });
    return true;
  } catch {
    const claimed = await prisma.cronRun.updateMany({
      where: { name, OR: [{ lastClaimAt: null }, { lastClaimAt: { lte: before } }] },
      data: { lastClaimAt: now },
    });
    return claimed.count === 1;
  }
}

function founderEmails() {
  return (process.env.ORVIUS_FOUNDER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

export async function pagePlatform(kind: PlatformFailure, detail: Record<string, unknown> = {}, now = new Date()) {
  captureServerMessage(HEADLINE[kind], { surface: "platform", reason: kind }, { level: "error", extra: detail });
  /* The database may be the thing that is down; page anyway rather than stay quiet. */
  const first = kind === "db_unreachable" ? true : await claimPage(kind, now).catch(() => true);
  if (!first) return { paged: false as const };

  const text = `Orvius platform alert: ${HEADLINE[kind]}`;
  const sent = { sms: false, email: 0 };
  const phone = process.env.ORVIUS_FOUNDER_PHONE?.trim();
  if (phone) {
    sent.sms = Boolean(await sendSms({ to: phone, body: text, audience: "owner" }).catch(() => null));
  }
  if (isEmailConfigured()) {
    for (const to of founderEmails()) {
      const ok = await sendOwnerEmail({ to, subject: `Orvius platform alert: ${kind}`, text: `${text}\n\n${JSON.stringify(detail, null, 2)}` })
        .then(() => true)
        .catch(() => false);
      if (ok) sent.email += 1;
    }
  }
  if (!sent.sms && !sent.email) logError("platform.page_undelivered", { kind, ...detail });
  return { paged: true as const, ...sent };
}

/** Vapi's ended reasons for calls it refused over the account's billing. */
export function isVapiBillingRefusal(endedReason: string | null | undefined) {
  return Boolean(endedReason && /insufficient-credits|subscription-frozen|subscription-.*(limit|expired)|wallet|payment-?(failed|required)|billing/i.test(endedReason));
}

/** Twilio codes that mean the account itself can't send, not one bad number. */
const TWILIO_ACCOUNT_CODES = new Set([20003, 20005, 30002, 10001]);
export function isTwilioAccountFailure(error: unknown) {
  const code = Number((error as { code?: unknown })?.code);
  return TWILIO_ACCOUNT_CODES.has(code);
}

/**
 * A shop whose alerts reach nobody: the text failed for good and there is no
 * email to fall back to (or the email failed too). Someone at Orvius has to
 * phone the shop, so the founder gets one text per shop per day.
 */
export async function pageOwnerUnreachable(businessId: string, lastChannel: "sms" | "email", now = new Date()) {
  const name = `page:owner_unreachable:${businessId}:${now.toISOString().slice(0, 10)}`;
  const first = await prisma.cronRun
    .create({ data: { name, lastClaimAt: now } })
    .then(() => true)
    .catch(() => false);
  if (!first) return { paged: false as const };
  const shop = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true, ownerPhone: true, ownerEmail: true } });
  const text = `Orvius: ${shop?.name ?? "a shop"}'s owner alerts can't be delivered (${lastChannel === "sms" ? "text failed, no email backup" : "text and email both failed"}). Call them: ${shop?.ownerPhone ?? "no phone"}${shop?.ownerEmail ? `, ${shop.ownerEmail}` : ""}.`;
  const phone = process.env.ORVIUS_FOUNDER_PHONE?.trim();
  const sms = phone ? Boolean(await sendSms({ to: phone, body: text, audience: "owner" }).catch(() => null)) : false;
  if (!sms) logError("platform.owner_unreachable", { businessId, lastChannel });
  return { paged: true as const, sms };
}

/** A paying shop that needs a person from Orvius, once per shop per reason. */
export async function pageFounderForShop(businessId: string, reason: string, text: string, now = new Date()) {
  const first = await prisma.cronRun
    .create({ data: { name: `page:shop:${reason}:${businessId}`, lastClaimAt: now } })
    .then(() => true)
    .catch(() => false);
  if (!first) return { paged: false as const };
  const phone = process.env.ORVIUS_FOUNDER_PHONE?.trim();
  const sms = phone ? Boolean(await sendSms({ to: phone, body: text, audience: "owner" }).catch(() => null)) : false;
  let email = 0;
  if (isEmailConfigured()) {
    for (const to of founderEmails()) {
      if (await sendOwnerEmail({ to, subject: `Orvius: a shop needs a hand (${reason})`, text }).then(() => true).catch(() => false)) email += 1;
    }
  }
  if (!sms && !email) logError("platform.shop_page_undelivered", { businessId, reason });
  return { paged: true as const, sms, email };
}
