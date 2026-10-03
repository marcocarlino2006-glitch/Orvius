import { randomBytes } from "node:crypto";
import {
  isReplayable,
  shareableTurns,
  type Replay,
  type ReplayCapture,
  type ReplayTurn,
} from "@/lib/call-replay-copy";
import { prisma } from "@/lib/prisma";

function parseTurns(raw: string | null | undefined): ReplayTurn[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ReplayTurn[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export type ShareResult = { ok: true; id: string; reused: boolean } | { ok: false; reason: "not_found" | "no_call" };

/** Freezes the preview's last call as a public replay. Sharing the same call twice returns the same link. */
export async function shareReplay(token: string, client = prisma): Promise<ShareResult> {
  const preview = await client.shopPreview.findUnique({ where: { token } });
  if (!preview) return { ok: false, reason: "not_found" };
  const turns = shareableTurns(parseTurns(preview.transcriptJson));
  if (!isReplayable(turns)) return { ok: false, reason: "no_call" };

  const turnsJson = JSON.stringify(turns);
  const existing = await client.callReplay.findFirst({
    where: { previewId: preview.id, turnsJson },
    select: { id: true },
  });
  if (existing) return { ok: true, id: existing.id, reused: true };

  let capture: ReplayCapture | null = null;
  try {
    const raw = preview.lastCaptureJson ? (JSON.parse(preview.lastCaptureJson) as Record<string, string | undefined>) : null;
    capture = raw
      ? { serviceType: raw.serviceType, urgency: raw.urgency, firstName: raw.name?.trim().split(/\s+/)[0] }
      : null;
  } catch {
    capture = null;
  }

  const id = randomBytes(9).toString("base64url");
  await client.callReplay.create({
    data: {
      id,
      previewId: preview.id,
      shopName: preview.shopName,
      trade: preview.trade,
      turnsJson,
      captureJson: capture ? JSON.stringify(capture) : null,
    },
  });
  return { ok: true, id, reused: false };
}

export async function getReplay(id: string, { countView = false } = {}, client = prisma): Promise<Replay | null> {
  if (!/^[A-Za-z0-9_-]{8,20}$/.test(id)) return null;
  const row = await client.callReplay.findUnique({ where: { id } });
  if (!row) return null;
  if (countView) {
    void client.callReplay.update({ where: { id }, data: { views: { increment: 1 } } }).catch(() => null);
  }
  let capture: ReplayCapture | null = null;
  try {
    capture = row.captureJson ? (JSON.parse(row.captureJson) as ReplayCapture) : null;
  } catch {
    capture = null;
  }
  return { id: row.id, shopName: row.shopName, trade: row.trade, turns: parseTurns(row.turnsJson), capture };
}
