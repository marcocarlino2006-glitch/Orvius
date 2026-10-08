import { normalizePhone } from "@/lib/customer";
import { logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export type MessageAuthor = "customer" | "orvius" | "owner";

/** How long after the owner's last text a customer's reply stays the owner's conversation. */
export const OWNER_CONVERSATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Write one text to the thread. A failed write must never cost the send or the
 * capture, and a redelivered sid is the same text, not a second one.
 */
export type InboundMedia = { url: string; type: string };

export const MAX_MESSAGE_PHOTOS = 5;
export const PHOTO_ONLY_BODY = "Sent a photo";

/** Twilio's MMS fields, kept only when they are images hosted by Twilio itself. */
export function inboundMediaFromForm(form: Record<string, string>): InboundMedia[] {
  const count = Math.min(Number(form.NumMedia ?? 0) || 0, 10);
  const media: InboundMedia[] = [];
  for (let i = 0; i < count && media.length < MAX_MESSAGE_PHOTOS; i += 1) {
    const url = form[`MediaUrl${i}`]?.trim();
    const type = form[`MediaContentType${i}`]?.trim().toLowerCase() ?? "";
    if (url && isTwilioMediaUrl(url) && /^image\/(jpeg|png|gif|webp|heic|heif)$/.test(type)) media.push({ url, type });
  }
  return media;
}

export function isTwilioMediaUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "api.twilio.com" && u.pathname.startsWith("/2010-04-01/Accounts/");
  } catch {
    return false;
  }
}

export function parseMedia(raw: string | null | undefined): InboundMedia[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((m) => m && typeof m.url === "string" && isTwilioMediaUrl(m.url)) : [];
  } catch {
    return [];
  }
}

export async function recordMessage(params: {
  businessId: string;
  phone: string;
  direction: "in" | "out";
  author: MessageAuthor;
  body: string;
  sid?: string | null;
  at?: Date;
  media?: InboundMedia[];
}): Promise<{ id: string } | null> {
  const phoneNormalized = normalizePhone(params.phone);
  const body = params.body.trim();
  if (!phoneNormalized || !body) return null;
  const media = params.media?.length ? JSON.stringify(params.media) : null;
  try {
    return await prisma.message.create({
      data: {
        businessId: params.businessId,
        phoneNormalized,
        direction: params.direction,
        author: params.author,
        body,
        sid: params.sid || null,
        mediaJson: media,
        readAt: params.direction === "out" ? (params.at ?? new Date()) : null,
        ...(params.at ? { createdAt: params.at } : {}),
      },
      select: { id: true },
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") return null;
    logWarn("messages.record_failed", {
      businessId: params.businessId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

/**
 * The owner texted this phone recently, so a reply belongs to them: it lands in
 * the thread and alerts the owner instead of opening a new lead with an
 * auto-reply talking over the owner.
 */
export async function hasActiveOwnerConversation(
  businessId: string,
  phone: string,
  now = new Date(),
): Promise<boolean> {
  const phoneNormalized = normalizePhone(phone);
  if (!phoneNormalized) return false;
  const [last, takeover] = await Promise.all([
    prisma.message.findFirst({
      where: {
        businessId,
        phoneNormalized,
        author: "owner",
        createdAt: { gte: new Date(now.getTime() - OWNER_CONVERSATION_WINDOW_MS) },
      },
      select: { id: true },
    }),
    prisma.takeover.findFirst({ where: { businessId, phoneNormalized, releasedAt: null }, select: { id: true } }),
  ]);
  return Boolean(last || takeover);
}

export type ThreadSummary = {
  phone: string;
  name: string | null;
  customerId: string | null;
  lastBody: string;
  lastDirection: "in" | "out";
  lastAuthor: MessageAuthor;
  lastAt: string;
  unread: number;
  optedOut: boolean;
};

const THREAD_SCAN = 2000;

export async function listThreads(
  businessId: string,
  { limit = 50, query = "" }: { limit?: number; query?: string } = {},
): Promise<ThreadSummary[]> {
  const recent = await prisma.message.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: THREAD_SCAN,
    select: {
      phoneNormalized: true,
      body: true,
      direction: true,
      author: true,
      createdAt: true,
      readAt: true,
    },
  });

  const threads = new Map<string, ThreadSummary>();
  for (const row of recent) {
    let thread = threads.get(row.phoneNormalized);
    if (!thread) {
      thread = {
        phone: row.phoneNormalized,
        name: null,
        customerId: null,
        lastBody: row.body,
        lastDirection: row.direction === "in" ? "in" : "out",
        lastAuthor: row.author as MessageAuthor,
        lastAt: row.createdAt.toISOString(),
        unread: 0,
        optedOut: false,
      };
      threads.set(row.phoneNormalized, thread);
    }
    if (row.direction === "in" && !row.readAt) thread.unread += 1;
  }

  const phones = [...threads.keys()];
  if (!phones.length) return [];
  const [customers, optOuts] = await Promise.all([
    prisma.customer.findMany({
      where: { businessId, phoneNormalized: { in: phones } },
      select: { id: true, name: true, phoneNormalized: true },
    }),
    prisma.smsOptOut.findMany({
      where: { businessId, phoneNormalized: { in: phones }, clearedAt: null },
      select: { phoneNormalized: true },
    }),
  ]);
  for (const customer of customers) {
    const thread = threads.get(customer.phoneNormalized);
    if (thread) {
      thread.name = customer.name;
      thread.customerId = customer.id;
    }
  }
  for (const optOut of optOuts) {
    const thread = threads.get(optOut.phoneNormalized);
    if (thread) thread.optedOut = true;
  }

  const needle = query.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  return [...threads.values()]
    .filter((thread) => {
      if (!needle) return true;
      if (digits && thread.phone.includes(digits)) return true;
      return (
        (thread.name ?? "").toLowerCase().includes(needle) ||
        thread.lastBody.toLowerCase().includes(needle)
      );
    })
    .slice(0, limit);
}

export type ThreadEntry =
  | {
      kind: "text";
      id: string;
      at: string;
      direction: "in" | "out";
      author: MessageAuthor;
      body: string;
      deliveryStatus: string | null;
      /** Count of photos, served by /api/messages/media?id=&i=. */
      photos: number;
    }
  | {
      kind: "call";
      id: string;
      at: string;
      direction: string;
      status: string;
      durationSec: number | null;
      summary: string | null;
    };

export async function getThread(businessId: string, phone: string) {
  const phoneNormalized = normalizePhone(phone);
  if (!phoneNormalized) return null;

  const [messages, customer, optOut] = await Promise.all([
    prisma.message.findMany({
      where: { businessId, phoneNormalized },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.customer.findUnique({
      where: { businessId_phoneNormalized: { businessId, phoneNormalized } },
      select: { id: true, name: true, address: true, interactionCount: true },
    }),
    prisma.smsOptOut.findUnique({
      where: { businessId_phoneNormalized: { businessId, phoneNormalized } },
      select: { clearedAt: true },
    }),
  ]);
  const takeover = await prisma.takeover.findUnique({
    where: { businessId_phoneNormalized: { businessId, phoneNormalized } },
    select: { releasedAt: true, takenBy: true, createdAt: true },
  });

  const calls = await prisma.call.findMany({
    where: {
      businessId,
      OR: [
        ...(customer ? [{ customerId: customer.id }] : []),
        { callerPhone: phoneNormalized },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      createdAt: true,
      direction: true,
      status: true,
      durationSec: true,
      summary: true,
    },
  });

  const entries: ThreadEntry[] = [
    ...messages.map(
      (m): ThreadEntry => ({
        kind: "text",
        id: m.id,
        at: m.createdAt.toISOString(),
        direction: m.direction === "in" ? "in" : "out",
        author: m.author as MessageAuthor,
        body: m.body,
        deliveryStatus: m.deliveryStatus,
        photos: parseMedia(m.mediaJson).length,
      }),
    ),
    ...calls.map(
      (c): ThreadEntry => ({
        kind: "call",
        id: c.id,
        at: c.createdAt.toISOString(),
        direction: c.direction,
        status: c.status,
        durationSec: c.durationSec,
        summary: c.summary,
      }),
    ),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return {
    phone: phoneNormalized,
    customer,
    optedOut: Boolean(optOut && !optOut.clearedAt),
    takenOver: takeover && !takeover.releasedAt ? { by: takeover.takenBy, since: takeover.createdAt.toISOString() } : null,
    entries,
  };
}

const RECEIPT_RANK: Record<string, number> = { queued: 0, accepted: 0, sending: 1, sent: 2, delivered: 3, read: 4, undelivered: 5, failed: 5 };

/** A carrier receipt moves a text forward (sent → delivered) or to failed, never back. */
export async function applyMessageReceipt(params: { messageSid: string; messageStatus: string }) {
  const next = params.messageStatus.toLowerCase();
  if (!(next in RECEIPT_RANK) || !params.messageSid) return 0;
  const rows = await prisma.message.findMany({
    where: { sid: params.messageSid, direction: "out" },
    select: { id: true, deliveryStatus: true },
  });
  let updated = 0;
  for (const row of rows) {
    const current = row.deliveryStatus ? (RECEIPT_RANK[row.deliveryStatus] ?? -1) : -1;
    if (RECEIPT_RANK[next] <= current) continue;
    const result = await prisma.message.updateMany({
      where: { id: row.id, deliveryStatus: row.deliveryStatus },
      data: { deliveryStatus: next === "read" ? "delivered" : next },
    });
    updated += result.count;
  }
  const techTexts = await prisma.outboundSms.findMany({
    where: { sid: params.messageSid, audience: "tech" },
    select: { id: true, deliveryStatus: true },
  });
  for (const row of techTexts) {
    const current = row.deliveryStatus ? (RECEIPT_RANK[row.deliveryStatus] ?? -1) : -1;
    if (RECEIPT_RANK[next] <= current) continue;
    const result = await prisma.outboundSms.updateMany({
      where: { id: row.id, deliveryStatus: row.deliveryStatus },
      data: { deliveryStatus: next === "read" ? "delivered" : next },
    });
    updated += result.count;
  }
  return updated;
}

export async function markThreadRead(businessId: string, phone: string, now = new Date()) {
  const phoneNormalized = normalizePhone(phone);
  if (!phoneNormalized) return 0;
  const result = await prisma.message.updateMany({
    where: { businessId, phoneNormalized, direction: "in", readAt: null },
    data: { readAt: now },
  });
  return result.count;
}
