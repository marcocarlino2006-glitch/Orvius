import { randomBytes } from "node:crypto";
import { CALL_OUTCOME_LABEL, callOutcome } from "@/lib/call-outcome";
import { isReplayable, maskCustomerCall, replayTurns, type Replay, type ReplayCapture, type ReplayTurn } from "@/lib/call-replay-copy";
import { prisma } from "@/lib/prisma";

/*
  The public gallery of real calls. A shop's owner picks a call, reads exactly
  what strangers will see, and confirms the caller agreed; an Orvius admin then
  lists it. Only the masked words are copied out of the call: no audio, no
  phone number, no address, no caller name.
*/

export const GALLERY_STATUSES = ["pending", "listed", "removed", "withdrawn"] as const;
export type GalleryStatus = (typeof GALLERY_STATUSES)[number];

export class GalleryRefused extends Error {}

type Draft = { shopName: string; trade: string; turns: ReplayTurn[]; capture: ReplayCapture };

async function draftFor(businessId: string, callId: string): Promise<Draft | null> {
  const call = await prisma.call.findFirst({
    where: { id: callId, businessId },
    include: {
      business: { select: { name: true, trade: true } },
      customer: { select: { name: true, address: true } },
      lead: { select: { name: true, address: true, serviceType: true, urgency: true, job: { select: { id: true } } } },
    },
  });
  if (!call || !call.transcript || call.contentPurgedAt) return null;
  const known = [call.customer?.name, call.customer?.address, call.lead?.name, call.lead?.address];
  const turns = replayTurns({ transcript: call.transcript })
    .map((t) => ({ ...t, text: maskCustomerCall(t.text, known) }))
    .filter((t) => t.text && t.text !== "•••");
  const outcome = CALL_OUTCOME_LABEL[callOutcome(call)];
  return {
    shopName: call.business.name,
    trade: call.business.trade ?? "Home services",
    turns,
    capture: {
      serviceType: call.lead?.serviceType ? maskCustomerCall(call.lead.serviceType, known) : undefined,
      urgency: call.lead?.urgency ?? undefined,
      outcome,
    },
  };
}

export type GalleryDraftView =
  | { shareable: false; reason: string; status?: GalleryStatus }
  | { shareable: true; draft: Draft; status: GalleryStatus | null };

/** What the owner sees before sharing: the exact masked words strangers would read. */
export async function galleryDraft(businessId: string, callId: string): Promise<GalleryDraftView> {
  const existing = await prisma.galleryCall.findUnique({ where: { callId }, select: { businessId: true, status: true } });
  if (existing && existing.businessId !== businessId) return { shareable: false, reason: "Call not found." };
  const draft = await draftFor(businessId, callId);
  if (!draft) return { shareable: false, reason: "There's no transcript for this call to share.", status: existing?.status as GalleryStatus | undefined };
  if (!isReplayable(draft.turns)) return { shareable: false, reason: "This call is too short to be worth sharing.", status: existing?.status as GalleryStatus | undefined };
  return { shareable: true, draft, status: (existing?.status as GalleryStatus | undefined) ?? null };
}

/** Send a call for review. Sharing again after withdrawing re-submits the current masked words. */
export async function shareToGallery(input: { businessId: string; callId: string; sharedByEmail: string; callerAgreed: boolean; now?: Date }) {
  if (input.callerAgreed !== true) throw new GalleryRefused("Confirm the caller agreed before sharing their call.");
  const view = await galleryDraft(input.businessId, input.callId);
  if (!view.shareable) throw new GalleryRefused(view.reason);
  if (view.status === "removed") throw new GalleryRefused("Orvius took this call off the gallery, so it can't be shared again.");
  const now = input.now ?? new Date();
  const data = {
    shopName: view.draft.shopName,
    trade: view.draft.trade,
    turnsJson: JSON.stringify(view.draft.turns),
    captureJson: JSON.stringify(view.draft.capture),
    callerConsentAt: now,
    sharedByEmail: input.sharedByEmail.toLowerCase(),
  };
  if (view.status === "listed" || view.status === "pending") {
    return prisma.galleryCall.findUniqueOrThrow({ where: { callId: input.callId } });
  }
  return prisma.galleryCall.upsert({
    where: { callId: input.callId },
    create: { id: randomBytes(9).toString("base64url"), businessId: input.businessId, callId: input.callId, status: "pending", ...data },
    update: { ...data, status: "pending", reviewedAt: null },
  });
}

/** The owner can take a call down at any time; it leaves the gallery immediately. */
export async function withdrawFromGallery(businessId: string, callId: string) {
  const res = await prisma.galleryCall.updateMany({ where: { businessId, callId, status: { in: ["pending", "listed"] } }, data: { status: "withdrawn" } });
  return res.count > 0;
}

export async function reviewGalleryCall(id: string, decision: "listed" | "removed", now = new Date()) {
  const res = await prisma.galleryCall.updateMany({
    where: { id, status: decision === "listed" ? "pending" : { in: ["pending", "listed"] } },
    data: { status: decision, reviewedAt: now },
  });
  return res.count > 0;
}

export async function pendingGalleryCalls() {
  return prisma.galleryCall.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, take: 50 });
}

function toReplay(row: { id: string; shopName: string; trade: string; turnsJson: string; captureJson: string | null }): Replay {
  const parse = <T,>(raw: string | null, fallback: T): T => {
    try {
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  return { id: row.id, shopName: row.shopName, trade: row.trade, turns: parse<ReplayTurn[]>(row.turnsJson, []), capture: parse<ReplayCapture | null>(row.captureJson, null), kind: "shop" };
}

export async function listGallery(limit = 24): Promise<Replay[]> {
  const rows = await prisma.galleryCall.findMany({ where: { status: "listed" }, orderBy: { reviewedAt: "desc" }, take: Math.min(Math.max(limit, 1), 60) });
  return rows.map(toReplay);
}

export async function getGalleryCall(id: string, { countView = false } = {}): Promise<Replay | null> {
  if (!/^[A-Za-z0-9_-]{8,20}$/.test(id)) return null;
  const row = await prisma.galleryCall.findFirst({ where: { id, status: "listed" } });
  if (!row) return null;
  if (countView) void prisma.galleryCall.update({ where: { id }, data: { views: { increment: 1 } } }).catch(() => null);
  return toReplay(row);
}
