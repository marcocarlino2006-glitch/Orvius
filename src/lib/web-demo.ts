import { createHash } from "node:crypto";
import { getDemoPlatformLine } from "@/lib/demo-business";
import { prisma } from "@/lib/prisma";
import { resolveBusinessByInboundPhone } from "@/lib/resolve-shop-line";
import { buildPreviewAssistant, claimWebPreviewCall } from "@/lib/shop-preview";

/*
  Talk to the receptionist from the browser, no phone needed. Every web call
  still runs on the one Vapi account paying shops depend on, so visitors wait
  in a real line for one of a fixed number of slots instead of all connecting
  at once. The call is created here with the private key, so there is no
  public key on the page to start calls around the line.
*/

export const WEB_DEMO_CHANNEL = "web_demo";
export const WEB_DEMO_MAX_SECONDS = 180;
export const DEFAULT_WEB_DEMO_CAP = 10;
export const DEFAULT_WEB_DEMO_DAILY = 2000;
const TICKETS_PER_IP_PER_HOUR = 4;
/* A visitor whose page stopped polling has left the line. */
const HEARTBEAT_MS = 30_000;
/* Polls closer together than this don't rewrite the heartbeat. */
const HEARTBEAT_WRITE_MS = 10_000;
/* A slot handed out but not used is given to the next visitor. */
const GRANT_MS = 90_000;
/* The call ends itself at 3 minutes; anything older lost its end report. */
const LIVE_MS = (WEB_DEMO_MAX_SECONDS + 60) * 1000;
/* What a slot is assumed to take when estimating the wait. */
const AVG_CALL_SEC = 100;

const envInt = (raw: string | undefined, fallback: number) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};
export const webDemoCap = (env: NodeJS.ProcessEnv = process.env) => envInt(env.ORVIUS_DEMO_WEB_MAX_LIVE, DEFAULT_WEB_DEMO_CAP);
export const webDemoDaily = (env: NodeJS.ProcessEnv = process.env) => envInt(env.ORVIUS_DEMO_WEB_DAILY_CEILING, DEFAULT_WEB_DEMO_DAILY);

export function hashVisitor(ip: string) {
  const salt = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "orvius-web-demo";
  return createHash("sha256").update(`web-demo/1\n${salt}\n${ip}`).digest("hex").slice(0, 32);
}

export type TicketView =
  | { state: "waiting"; ticketId: string; position: number; talkingNow: number; waitSeconds: number; pollSeconds: number }
  | { state: "ready"; ticketId: string }
  | { state: "live"; ticketId: string }
  | { state: "done"; ticketId: string }
  | { state: "closed"; reason: "daily" | "limit" | "off" };

let seededCap = 0;
async function ensureSlots(cap: number) {
  if (seededCap >= cap) return;
  const have = new Set((await prisma.demoSlot.findMany({ where: { id: { lt: cap } }, select: { id: true } })).map((r) => r.id));
  for (let id = 0; id < cap; id++) {
    if (!have.has(id)) await prisma.demoSlot.create({ data: { id, heldUntil: new Date(0) } }).catch(() => null);
  }
  seededCap = cap;
}

async function slotsInUse(cap: number, now: Date) {
  return prisma.demoSlot.count({ where: { id: { lt: cap }, heldUntil: { gt: now } } });
}

/** Take one free row for this ticket; null when every slot under the cap is held. */
async function claimSlot(ticketId: string, cap: number, now: Date, holdMs: number) {
  await ensureSlots(cap);
  const free = await prisma.demoSlot.findMany({ where: { id: { lt: cap }, heldUntil: { lte: now } }, select: { id: true }, orderBy: { id: "asc" } });
  for (const { id } of free) {
    const won = await prisma.demoSlot.updateMany({ where: { id, heldUntil: { lte: now } }, data: { ticketId, heldUntil: new Date(now.getTime() + holdMs) } });
    if (won.count) return id;
  }
  return null;
}

async function releaseSlot(ticketId: string, now: Date) {
  await prisma.demoSlot.updateMany({ where: { ticketId }, data: { ticketId: null, heldUntil: now } });
}

async function startedToday(now: Date) {
  return prisma.demoTicket.count({ where: { startedAt: { gte: new Date(now.getTime() - 86_400_000) } } });
}

/** Where a ticket stands, giving it a slot when one is free and nobody fresher is ahead. */
export async function checkTicket(ticketId: string, now = new Date()): Promise<TicketView> {
  const ticket = await prisma.demoTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { state: "closed", reason: "off" };
  if (ticket.status === "done") return { state: "done", ticketId };
  if (ticket.status === "live") return ticket.startedAt && now.getTime() - ticket.startedAt.getTime() < LIVE_MS ? { state: "live", ticketId } : { state: "done", ticketId };
  if (ticket.status === "granted") {
    if (ticket.grantedAt && now.getTime() - ticket.grantedAt.getTime() < GRANT_MS) return { state: "ready", ticketId };
    await prisma.demoTicket.updateMany({ where: { id: ticketId, status: "granted" }, data: { status: "done", endedAt: now } });
    return { state: "done", ticketId };
  }

  if (now.getTime() - ticket.lastSeenAt.getTime() > HEARTBEAT_WRITE_MS) {
    await prisma.demoTicket.update({ where: { id: ticketId }, data: { lastSeenAt: now } });
  }
  if ((await startedToday(now)) >= webDemoDaily()) return { state: "closed", reason: "daily" };
  const cap = webDemoCap();
  await ensureSlots(cap);
  const [talkingNow, ahead] = await Promise.all([
    slotsInUse(cap, now),
    prisma.demoTicket.count({ where: { status: "waiting", lastSeenAt: { gte: new Date(now.getTime() - HEARTBEAT_MS) }, createdAt: { lt: ticket.createdAt } } }),
  ]);
  const slot = ahead < cap - talkingNow ? await claimSlot(ticketId, cap, now, GRANT_MS) : null;
  if (slot != null) {
    const granted = await prisma.demoTicket.updateMany({ where: { id: ticketId, status: "waiting" }, data: { status: "granted", grantedAt: now } });
    if (granted.count) return { state: "ready", ticketId };
    await prisma.demoSlot.updateMany({ where: { id: slot, ticketId }, data: { ticketId: null, heldUntil: now } });
    return checkTicket(ticketId, now);
  }
  const position = ahead + 1;
  const pollSeconds = position <= cap * 2 ? 3 : 8;
  return { state: "waiting", ticketId, position, talkingNow, waitSeconds: Math.max(15, Math.ceil(position / cap) * AVG_CALL_SEC), pollSeconds };
}

/** Join the line, or pick up the place this visitor already holds. */
export async function joinLine(ip: string, now = new Date(), previewId?: string): Promise<TicketView> {
  const ipHash = hashVisitor(ip);
  const open = await prisma.demoTicket.findFirst({
    where: { ipHash, status: { in: ["waiting", "granted", "live"] }, createdAt: { gte: new Date(now.getTime() - 30 * 60_000) } },
    orderBy: { createdAt: "desc" },
  });
  if (open) {
    if (previewId && open.previewId !== previewId && open.status === "waiting") {
      await prisma.demoTicket.update({ where: { id: open.id }, data: { previewId } });
    }
    const view = await checkTicket(open.id, now);
    if (view.state !== "done") return view;
  }
  const recent = await prisma.demoTicket.count({ where: { ipHash, createdAt: { gte: new Date(now.getTime() - 60 * 60_000) } } });
  if (recent >= TICKETS_PER_IP_PER_HOUR) return { state: "closed", reason: "limit" };
  const ticket = await prisma.demoTicket.create({ data: { ipHash, createdAt: now, lastSeenAt: now, previewId: previewId ?? null } });
  return checkTicket(ticket.id, now);
}

export type WebCall = { id: string; webCallUrl: string; transport?: { callToken?: string }; assistant?: { voice?: { provider?: string } }; artifactPlan?: { videoRecordingEnabled?: boolean } };
export type CreateWebCall = (body: Record<string, unknown>) => Promise<WebCall>;

export class WebDemoRefused extends Error {}

async function demoAssistantId() {
  const demo = await resolveBusinessByInboundPhone(getDemoPlatformLine());
  return demo?.vapiAssistantId ?? null;
}

/**
 * Turn a granted place in line into a call. The slot is claimed before Vapi is
 * asked, so a double click can't open two calls; if Vapi refuses, the slot is
 * released for the next visitor.
 */
export async function startWebDemo(ticketId: string, create: CreateWebCall, now = new Date()) {
  const claimed = await prisma.demoTicket.updateMany({
    where: { id: ticketId, status: "granted", grantedAt: { gte: new Date(now.getTime() - GRANT_MS) } },
    data: { status: "live", startedAt: now },
  });
  if (!claimed.count) throw new WebDemoRefused("Your turn timed out. Join the line again.");
  const held = await prisma.demoSlot.updateMany({ where: { ticketId, heldUntil: { gt: now } }, data: { heldUntil: new Date(now.getTime() + LIVE_MS) } });
  if (!held.count) {
    await prisma.demoTicket.update({ where: { id: ticketId }, data: { status: "done", endedAt: now } });
    throw new WebDemoRefused("Your turn timed out. Join the line again.");
  }
  try {
    const ticket = await prisma.demoTicket.findUnique({ where: { id: ticketId }, select: { previewId: true } });
    let body: Record<string, unknown>;
    let previewId: string | null = null;
    if (ticket?.previewId) {
      const preview = await claimWebPreviewCall(ticket.previewId, now);
      if (!preview) throw new WebDemoRefused("That business has used its free calls. Start your line to keep it answering.");
      previewId = preview.id;
      const assistant = buildPreviewAssistant(preview);
      body = { assistant: { ...assistant, maxDurationSeconds: WEB_DEMO_MAX_SECONDS, metadata: { ...assistant.metadata, demoTicketId: ticketId } } };
    } else {
      const assistantId = await demoAssistantId();
      if (!assistantId) throw new Error("demo assistant missing");
      body = { assistantId, assistantOverrides: { maxDurationSeconds: WEB_DEMO_MAX_SECONDS, metadata: { demoTicketId: ticketId } } };
    }
    const call = await create(body);
    if (!call?.id || !call.webCallUrl) throw new Error("vapi returned no web call");
    if (previewId) await prisma.shopPreview.update({ where: { id: previewId }, data: { lastVapiCallId: call.id } });
    await prisma.demoTicket.update({ where: { id: ticketId }, data: { vapiCallId: call.id } });
    return { id: call.id, webCallUrl: call.webCallUrl, transport: call.transport, assistant: { voice: { provider: call.assistant?.voice?.provider } }, artifactPlan: { videoRecordingEnabled: false } };
  } catch (error) {
    await prisma.demoTicket.update({ where: { id: ticketId }, data: { status: "done", endedAt: new Date() } });
    await releaseSlot(ticketId, new Date());
    throw error;
  }
}

export async function endWebDemo(where: { ticketId?: string; vapiCallId?: string }, now = new Date()) {
  if (!where.ticketId && !where.vapiCallId) return;
  const ticketId = where.ticketId ?? (await prisma.demoTicket.findUnique({ where: { vapiCallId: where.vapiCallId }, select: { id: true } }))?.id;
  if (!ticketId) return;
  await prisma.demoTicket.updateMany({ where: { id: ticketId, status: { not: "done" } }, data: { status: "done", endedAt: now } });
  await releaseSlot(ticketId, now);
  if (Math.random() < 0.01) {
    void prisma.demoTicket.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 3 * 86_400_000) } } }).catch(() => null);
  }
}

/** A web call reaching the demo assistant that didn't come through the line is ended. */
export async function isLineWebCall(vapiCallId: string) {
  return Boolean(await prisma.demoTicket.findUnique({ where: { vapiCallId }, select: { id: true } }));
}

export const createVapiWebCall: CreateWebCall = async (body) => {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) throw new Error("VAPI_API_KEY is not configured");
  const res = await fetch("https://api.vapi.ai/call/web", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`vapi web call ${res.status}`);
  return (await res.json()) as WebCall;
};
