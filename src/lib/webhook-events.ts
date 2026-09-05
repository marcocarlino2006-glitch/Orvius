import { prisma } from "@/lib/prisma";
import { logInfo, logWarn } from "@/lib/logger";

type RecordWebhookEventInput = {
  source: string;
  externalId: string;
  eventType: string;
  businessId?: string | null;
  status: string;
  payload?: unknown;
  error?: string | null;
};

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

export async function recordWebhookEvent(input: RecordWebhookEventInput) {
  try {
    await prisma.webhookEvent.create({
      data: {
        source: input.source,
        externalId: input.externalId,
        eventType: input.eventType,
        businessId: input.businessId ?? null,
        status: input.status,
        payloadJson: input.payload ? JSON.stringify(input.payload) : null,
        error: input.error ?? null,
      },
    });
    return { duplicate: false };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      logInfo("webhook.event.duplicate", {
        source: input.source,
        externalId: input.externalId,
        eventType: input.eventType,
      });
      return { duplicate: true };
    }
    logWarn("webhook.event.log_failed", {
      source: input.source,
      externalId: input.externalId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { duplicate: false, logFailed: true };
  }
}

export async function hasProcessedWebhookEvent(input: {
  source: string;
  externalId: string;
  eventType: string;
}) {
  const existing = await prisma.webhookEvent.findUnique({
    where: {
      source_externalId_eventType: {
        source: input.source,
        externalId: input.externalId,
        eventType: input.eventType,
      },
    },
    select: { status: true },
  });
  return existing?.status === "processed";
}

const STALE_CLAIM_MS = 10 * 60 * 1000;

/**
 * Atomic claim for webhook processing — does NOT use ownerNotifiedAt.
 * Reclaims stale "processing" rows so a crashed worker cannot block forever.
 */
export async function claimWebhookEvent(input: {
  source: string;
  externalId: string;
  eventType: string;
  businessId?: string | null;
  payload?: unknown;
}): Promise<{ claimed: boolean }> {
  const where = {
    source_externalId_eventType: {
      source: input.source,
      externalId: input.externalId,
      eventType: input.eventType,
    },
  } as const;

  try {
    await prisma.webhookEvent.create({
      data: {
        source: input.source,
        externalId: input.externalId,
        eventType: input.eventType,
        businessId: input.businessId ?? null,
        status: "processing",
        payloadJson: input.payload ? JSON.stringify(input.payload) : null,
      },
    });
    return { claimed: true };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    const existing = await prisma.webhookEvent.findUnique({
      where,
      select: { status: true, createdAt: true },
    });

    if (!existing) return { claimed: false };
    if (existing.status === "processed") return { claimed: false };

    const stale =
      existing.status === "processing" &&
      Date.now() - existing.createdAt.getTime() > STALE_CLAIM_MS;

    if (!stale && existing.status === "processing") {
      return { claimed: false };
    }

    // Reclaim failed or stale processing claims.
    const updated = await prisma.webhookEvent.updateMany({
      where: {
        source: input.source,
        externalId: input.externalId,
        eventType: input.eventType,
        status: { in: ["processing", "failed", "error"] },
      },
      data: {
        status: "processing",
        businessId: input.businessId ?? null,
        payloadJson: input.payload ? JSON.stringify(input.payload) : null,
        error: null,
      },
    });
    return { claimed: updated.count > 0 };
  }
}

export async function completeWebhookEvent(input: {
  source: string;
  externalId: string;
  eventType: string;
  status?: string;
  payload?: unknown;
  error?: string | null;
}) {
  await prisma.webhookEvent.updateMany({
    where: {
      source: input.source,
      externalId: input.externalId,
      eventType: input.eventType,
    },
    data: {
      status: input.status ?? "processed",
      payloadJson: input.payload ? JSON.stringify(input.payload) : undefined,
      error: input.error ?? null,
    },
  });
}
