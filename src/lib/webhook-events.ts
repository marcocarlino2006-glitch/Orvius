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
