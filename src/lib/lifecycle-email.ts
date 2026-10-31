import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { billableCallWhere } from "@/lib/billable-calls";
import { company } from "@/lib/company";
import { customerDisplayName, displayPhone } from "@/lib/customer";
import { sendOwnerEmail, isEmailConfigured } from "@/lib/email";
import { renderEmail, type EmailContent } from "@/lib/email-layout";
import { getAppUrl } from "@/lib/env";
import { logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { isSetupSandbox, parseSetup, stepsDone } from "@/lib/setup-flow";
import { isUniqueViolation } from "@/lib/unique-violation";

/*
  The emails that carry an owner from "started" to "it took a call":
  three nudges back into a setup they walked away from (an hour, a day, three
  days), a welcome the day the shop goes live, and a note when the first
  customer call comes in. A sweep on the five-minute drain sends them. Each is
  claimed in LifecycleEmail before it is sent, so two sweeps can't both send
  it, and nothing is sent twice. One link stops all of them.
*/

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const RECOVERY_STAGES = [
  { stage: 1, afterMs: HOUR_MS },
  { stage: 2, afterMs: DAY_MS },
  { stage: 3, afterMs: 3 * DAY_MS },
] as const;
/** A setup quiet longer than this is left alone: the nudges are for owners who were just here. */
const RECOVERY_WINDOW_MS = 7 * DAY_MS;
const WELCOME_WINDOW_MS = 3 * DAY_MS;
const FIRST_CALL_WATCH_MS = 30 * DAY_MS;
/** A first call older than this when first seen is recorded, not announced. */
const FIRST_CALL_FRESH_MS = 2 * DAY_MS;
const PER_KIND = 25;

export type LifecycleKind = "setup_recovery" | "welcome" | "first_call" | "opted_out";

class TableMissing extends Error {}

/** The highest nudge the quiet time has earned, or null when it's too soon, too late, sent, or stopped. */
export function recoveryStageDue(params: { quietMs: number; sentStages: number[]; optedOut: boolean }): number | null {
  if (params.optedOut || params.quietMs > RECOVERY_WINDOW_MS) return null;
  const due = [...RECOVERY_STAGES].reverse().find((s) => params.quietMs >= s.afterMs)?.stage ?? null;
  if (!due) return null;
  const sent = Math.max(0, ...params.sentStages);
  return sent >= due ? null : due;
}

function secret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || null;
}

function sign(businessId: string, key: string) {
  return createHmac("sha256", key).update(`lifecycle-email:${businessId}`).digest("base64url").slice(0, 32);
}

export function lifecycleEmailToken(businessId: string): string | null {
  const key = secret();
  return key ? `${businessId}.${sign(businessId, key)}` : null;
}

export function verifyLifecycleEmailToken(token: string | null | undefined): string | null {
  const key = secret();
  if (!key || !token || token.length > 200) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const businessId = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(sign(businessId, key));
  return given.length === want.length && timingSafeEqual(given, want) ? businessId : null;
}

export function lifecycleUnsubscribe(businessId: string) {
  const token = lifecycleEmailToken(businessId);
  if (!token) return null;
  const base = getAppUrl().replace(/\/$/, "");
  const t = encodeURIComponent(token);
  return { page: `${base}/unsubscribe/setup?t=${t}`, oneClick: `${base}/api/public/setup-emails?t=${t}` };
}

export async function stopLifecycleEmails(businessId: string) {
  const shop = await prisma.business.findUnique({ where: { id: businessId }, select: { ownerEmail: true } });
  if (!shop) return false;
  await prisma.lifecycleEmail.upsert({
    where: { dedupeKey: `opted_out:${businessId}` },
    create: { businessId, kind: "opted_out", dedupeKey: `opted_out:${businessId}`, toEmail: shop.ownerEmail ?? "", status: "stopped" },
    update: {},
  });
  return true;
}

export async function lifecycleEmailsStopped(businessId: string) {
  const row = await prisma.lifecycleEmail.findUnique({ where: { dedupeKey: `opted_out:${businessId}` }, select: { id: true } });
  return Boolean(row);
}

function missingTable(error: unknown) {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") ||
    /no such table/i.test(error instanceof Error ? error.message : String(error))
  );
}

/** The row is the lock: whoever inserts the key sends the email. */
async function claim(businessId: string, kind: LifecycleKind, dedupeKey: string, toEmail: string, status = "sending") {
  try {
    return await prisma.lifecycleEmail.create({ data: { businessId, kind, dedupeKey, toEmail, status }, select: { id: true } });
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    if (missingTable(error)) throw new TableMissing();
    throw error;
  }
}

async function send(
  shop: { id: string; ownerEmail: string },
  kind: LifecycleKind,
  dedupeKey: string,
  subject: string,
  content: EmailContent,
) {
  const claimed = await claim(shop.id, kind, dedupeKey, shop.ownerEmail);
  if (!claimed) return false;
  const unsubscribe = lifecycleUnsubscribe(shop.id);
  const { html, text } = renderEmail({ ...content, unsubscribeHref: unsubscribe?.page ?? null });
  try {
    const providerId = await sendOwnerEmail({
      to: shop.ownerEmail,
      subject,
      text,
      html,
      replyTo: company.supportEmail,
      ...(unsubscribe
        ? { headers: { "List-Unsubscribe": `<${unsubscribe.oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }
        : {}),
    });
    await prisma.lifecycleEmail.update({ where: { id: claimed.id }, data: { status: "sent", providerId } });
    return true;
  } catch (error) {
    await prisma.lifecycleEmail.update({ where: { id: claimed.id }, data: { status: "failed" } }).catch(() => null);
    logWarn("lifecycle_email.send_failed", { businessId: shop.id, kind, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

const link = (path: string) => `${getAppUrl().replace(/\/$/, "")}${path}`;

export function recoveryEmail(params: { name: string; stage: number; heard: boolean }): { subject: string; content: EmailContent } {
  const { name, stage, heard } = params;
  const action = { label: "Finish setup", href: link("/dashboard/onboarding") };
  if (stage === 1) {
    return {
      subject: `${name} is one step from answering`,
      content: {
        preheader: "Everything you saved is still there.",
        heading: `${name} is one step from answering.`,
        paragraphs: [
          "You started setting up your receptionist on Orvius. Everything you saved is still there.",
          heard
            ? "You've heard it answer. The last step picks a plan and gives your shop its number. Calls are answered from the minute it's on."
            : "Next, hear it answer a call as your shop, right in your browser. No card needed for that.",
        ],
        action,
        footer: `You're getting this because you started setting up ${name} on Orvius.`,
      },
    };
  }
  if (stage === 2) {
    return {
      subject: heard ? `${name}'s line is one step away` : `Hear ${name}'s receptionist answer`,
      content: {
        preheader: "It answers in your shop's name and holds a time on your calendar.",
        heading: "Pick up where you left off.",
        paragraphs: [
          `It answers in ${name}'s name, asks your trade's questions, takes the address and the problem, and holds a time on your calendar.`,
          heard
            ? "You've already heard it. Choose a plan and your shop gets its own number today."
            : "You can call it yourself before you pay anything.",
        ],
        action,
        footer: `You're getting this because you started setting up ${name} on Orvius.`,
      },
    };
  }
  return {
    subject: `Want a hand setting up ${name}?`,
    content: {
      preheader: "Reply with a good time and a person from Orvius will finish it with you.",
      heading: "Want us to set it up with you?",
      paragraphs: [
        "Reply to this email with a good time to call. A person from Orvius will ring you and finish setup with you, about ten minutes.",
        "Or pick up where you left off. Everything you saved is still there.",
      ],
      action,
      footer: `This is the last of these. You're getting it because you started setting up ${name} on Orvius.`,
    },
  };
}

export function welcomeEmail(params: { name: string; line: string }): { subject: string; content: EmailContent } {
  return {
    subject: `${params.name} is live on Orvius`,
    content: {
      preheader: `Your receptionist is answering ${displayPhone(params.line)}.`,
      heading: `${params.name} is live.`,
      paragraphs: [
        `Your receptionist is answering ${displayPhone(params.line)} in ${params.name}'s name. Each one lands on your desk as a job or a lead, and you get a text when one needs you.`,
        "Two things today: call the number yourself to hear it, then put it where customers find you (your Google listing, website and truck), or forward your current number to it.",
      ],
      facts: [["Your Orvius number", displayPhone(params.line)]],
      action: { label: "Open Orvius", href: link("/dashboard") },
      footer: "Forwarding steps for your phone carrier are in Orvius, under Settings, Phone.",
    },
  };
}

export function firstCallEmail(params: {
  name: string;
  callId: string;
  caller: string;
  at: Date;
  timezone: string;
  summary: string | null;
  booked: boolean;
}): { subject: string; content: EmailContent } {
  let when: string;
  try {
    when = new Intl.DateTimeFormat("en-US", { timeZone: params.timezone, weekday: "long", hour: "numeric", minute: "2-digit" }).format(params.at);
  } catch {
    when = params.at.toUTCString();
  }
  const summary = params.summary?.trim();
  return {
    subject: `Orvius answered ${params.name}'s first call`,
    content: {
      preheader: `${params.caller} called ${when}.`,
      heading: "Your first customer call is in.",
      paragraphs: [
        `${params.caller} called ${when}${params.booked ? ", and Orvius booked the visit" : ""}.`,
        ...(summary ? [summary.length > 280 ? `${summary.slice(0, 277)}…` : summary] : []),
        "Every call from here lands on your desk the same way: who called, what they need, and what happens next.",
      ],
      action: { label: "See the call", href: link(`/dashboard/calls/${params.callId}`) },
    },
  };
}

async function setupRecovery(now: Date, outOfTime: () => boolean) {
  const sandboxes = await prisma.business.findMany({
    where: {
      environment: "test",
      isActive: true,
      ownerEmail: { not: null },
      updatedAt: { gte: new Date(now.getTime() - RECOVERY_WINDOW_MS), lte: new Date(now.getTime() - RECOVERY_STAGES[0].afterMs) },
    },
    select: { id: true, name: true, ownerEmail: true, setupJson: true, environment: true, updatedAt: true },
    orderBy: { updatedAt: "asc" },
    take: 200,
  });
  const candidates = sandboxes.filter((s) => isSetupSandbox(s));
  if (!candidates.length) return 0;

  const emails = [...new Set(candidates.map((s) => s.ownerEmail!.toLowerCase()))];
  const live = await prisma.business.findMany({
    where: { ownerEmail: { in: emails }, environment: "production" },
    select: { ownerEmail: true },
  });
  const finished = new Set(live.map((b) => b.ownerEmail?.toLowerCase()));
  const ledger = await prisma.lifecycleEmail.findMany({
    where: { businessId: { in: candidates.map((s) => s.id) }, kind: { in: ["setup_recovery", "opted_out"] } },
    select: { businessId: true, kind: true, dedupeKey: true },
  });

  let sent = 0;
  for (const shop of candidates) {
    if (sent >= PER_KIND || outOfTime()) break;
    if (finished.has(shop.ownerEmail!.toLowerCase())) continue;
    const rows = ledger.filter((row) => row.businessId === shop.id);
    const stage = recoveryStageDue({
      quietMs: now.getTime() - shop.updatedAt.getTime(),
      sentStages: rows.filter((r) => r.kind === "setup_recovery").map((r) => Number(r.dedupeKey.split(":").at(-1)) || 0),
      optedOut: rows.some((r) => r.kind === "opted_out"),
    });
    if (!stage) continue;
    const heard = Boolean(stepsDone(parseSetup(shop.setupJson)).test);
    const { subject, content } = recoveryEmail({ name: shop.name, stage, heard });
    if (await send({ id: shop.id, ownerEmail: shop.ownerEmail! }, "setup_recovery", `setup_recovery:${shop.id}:${stage}`, subject, content)) sent += 1;
  }
  return sent;
}

const LIVE_BILLING = ["active", "trialing"];

async function welcomes(now: Date, outOfTime: () => boolean) {
  const since = new Date(now.getTime() - WELCOME_WINDOW_MS);
  const shops = await prisma.business.findMany({
    where: {
      environment: "production",
      isActive: true,
      ownerEmail: { not: null },
      billingStatus: { in: LIVE_BILLING },
      AND: [
        { OR: [{ createdAt: { gte: since } }, { paidSince: { gte: since } }] },
        { OR: [{ vapiPhoneNumber: { not: null } }, { twilioPhone: { not: null } }] },
      ],
      lifecycleEmails: { none: { kind: { in: ["welcome", "opted_out"] } } },
    },
    select: { id: true, name: true, ownerEmail: true, vapiPhoneNumber: true, twilioPhone: true },
    orderBy: { createdAt: "desc" },
    take: PER_KIND,
  });
  let sent = 0;
  for (const shop of shops) {
    if (outOfTime()) break;
    const line = shop.vapiPhoneNumber?.trim() || shop.twilioPhone?.trim();
    if (!line) continue;
    const { subject, content } = welcomeEmail({ name: shop.name, line });
    if (await send({ id: shop.id, ownerEmail: shop.ownerEmail! }, "welcome", `welcome:${shop.id}`, subject, content)) sent += 1;
  }
  return sent;
}

async function firstCalls(now: Date, outOfTime: () => boolean) {
  const since = new Date(now.getTime() - FIRST_CALL_WATCH_MS);
  const shops = await prisma.business.findMany({
    where: {
      environment: "production",
      isActive: true,
      ownerEmail: { not: null },
      billingStatus: { in: LIVE_BILLING },
      OR: [{ createdAt: { gte: since } }, { paidSince: { gte: since } }],
      calls: { some: { direction: "inbound", channel: null } },
      lifecycleEmails: { none: { kind: { in: ["first_call", "opted_out"] } } },
    },
    select: { id: true, name: true, ownerEmail: true, ownerPhone: true, transferPhone: true, timezone: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  let sent = 0;
  for (const shop of shops) {
    if (sent >= PER_KIND || outOfTime()) break;
    const call = await prisma.call.findFirst({
      where: {
        ...billableCallWhere(shop, { gte: shop.createdAt }),
        channel: null,
        status: { not: "in-progress" },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, createdAt: true, callerPhone: true, summary: true, booked: true, customer: { select: { name: true } } },
    });
    if (!call) continue;
    const key = `first_call:${shop.id}`;
    if (now.getTime() - call.createdAt.getTime() > FIRST_CALL_FRESH_MS) {
      await claim(shop.id, "first_call", key, shop.ownerEmail!, "skipped");
      continue;
    }
    const { subject, content } = firstCallEmail({
      name: shop.name,
      callId: call.id,
      caller: call.customer?.name?.trim() || (call.callerPhone ? customerDisplayName(null, call.callerPhone) : "A caller"),
      at: call.createdAt,
      timezone: shop.timezone,
      summary: call.summary,
      booked: call.booked,
    });
    if (await send({ id: shop.id, ownerEmail: shop.ownerEmail! }, "first_call", key, subject, content)) sent += 1;
  }
  return sent;
}

/**
 * Runs on the five-minute drain, inside its 30-second limit: whatever the
 * budget doesn't reach goes on the next run. A database without the
 * LifecycleEmail table yet sends nothing.
 */
export async function sendLifecycleEmails(now = new Date(), budgetMs = 12_000) {
  if (!isEmailConfigured()) return { ready: false as const, reason: "email is not configured" };
  const stopAt = Date.now() + budgetMs;
  const outOfTime = () => Date.now() >= stopAt;
  try {
    const recovery = await setupRecovery(now, outOfTime);
    const welcome = await welcomes(now, outOfTime);
    const firstCall = await firstCalls(now, outOfTime);
    if (recovery + welcome + firstCall) logInfo("lifecycle_email.sent", { recovery, welcome, firstCall });
    return { ready: true as const, recovery, welcome, firstCall };
  } catch (error) {
    if (error instanceof TableMissing || missingTable(error)) return { ready: false as const, reason: "LifecycleEmail table not created yet" };
    throw error;
  }
}

/** Sent per kind over the window, for the founder console. Null before the table exists. */
export async function lifecycleCounts(days: number, now = new Date()) {
  try {
    const rows = await prisma.lifecycleEmail.groupBy({
      by: ["kind", "status"],
      where: { createdAt: { gte: new Date(now.getTime() - days * DAY_MS) } },
      _count: { _all: true },
    });
    const sent = (kind: LifecycleKind) => rows.filter((r) => r.kind === kind && r.status === "sent").reduce((n, r) => n + r._count._all, 0);
    return {
      recovery: sent("setup_recovery"),
      welcome: sent("welcome"),
      firstCall: sent("first_call"),
      failed: rows.filter((r) => r.status === "failed").reduce((n, r) => n + r._count._all, 0),
      stopped: rows.filter((r) => r.kind === "opted_out").reduce((n, r) => n + r._count._all, 0),
    };
  } catch {
    return null;
  }
}
