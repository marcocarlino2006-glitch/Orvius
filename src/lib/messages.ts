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
export async function recordMessage(params: {
  businessId: string;
  phone: string;
  direction: "in" | "out";
  author: MessageAuthor;
  body: string;
  sid?: string | null;
  at?: Date;
}): Promise<{ id: string } | null> {
  const phoneNormalized = normalizePhone(params.phone);
  const body = params.body.trim();
  if (!phoneNormalized || !body) return null;
  try {
    return await prisma.message.create({
      data: {
        businessId: params.businessId,
        phoneNormalized,
        direction: params.direction,
        author: params.author,
        body,
        sid: params.sid || null,
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
  const last = await prisma.message.findFirst({
    where: {
      businessId,
      phoneNormalized,
      author: "owner",
      createdAt: { gte: new Date(now.getTime() - OWNER_CONVERSATION_WINDOW_MS) },
    },
    select: { id: true },
  });
  return Boolean(last);
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
    entries,
  };
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
