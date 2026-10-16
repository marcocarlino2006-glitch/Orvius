import { withLease } from "@/lib/provision-attempt";
import { logError, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { raiseReconciliation, type ReconKind } from "@/lib/system-of-record";

/*
  One Stripe or Vapi call that changes something, recorded before it is made.
  A reply that never arrives, or a local write that fails after the provider
  accepted, leaves a durable row and an exception a person can see; the next
  attempt recovers from the provider's own record instead of repeating the
  call blindly:

    pending → accepted → finalized
    pending → failed      the provider refused; nothing happened, a fresh key may try again
    pending → uncertain   no reply, or an ambiguous one; the next attempt replays the same
                          idempotency key while the provider still honours it, or looks the
                          effect up, and refuses to call again when it can't tell
    accepted/finalized → reverted   our own rollback undid it; a new attempt starts fresh
*/

export type EffectProvider = "stripe" | "vapi";
export type EffectStatus = "pending" | "accepted" | "finalized" | "uncertain" | "failed" | "reverted";

/** Stripe keeps an idempotency key's result for 24 hours; replay only well inside that. */
export const STRIPE_REPLAY_WINDOW_MS = 23 * 60 * 60_000;

export class UncertainEffectError extends Error {
  readonly effectId: string;
  readonly exceptionId: string | null;
  constructor(message: string, effectId: string, exceptionId: string | null) {
    super(message);
    this.name = "UncertainEffectError";
    this.effectId = effectId;
    this.exceptionId = exceptionId;
  }
}

export type EffectSpec<T> = {
  provider: EffectProvider;
  operation: string;
  correlationKey: string;
  businessId?: string | null;
  entity?: { type: string; id: string } | null;
  /** The reconciliation kind a stuck effect is filed under. */
  kind: ReconKind;
  /** How long the provider replays the same idempotency key; 0 when it has none. */
  replayWindowMs: number;
  perform: (idempotencyKey: string) => Promise<T>;
  idOf: (result: T) => string;
  retrieve: (providerId: string) => Promise<T>;
  /** Look the effect up at the provider: the result, null when it certainly doesn't exist; throw when it can't tell. */
  find?: () => Promise<T | null>;
  /** Our side of it: store the provider's id. Re-run on the next attempt if it fails. */
  finalize: (result: T) => Promise<unknown>;
  /** "refused" means the provider answered and did nothing. Anything else may have happened. */
  classify?: (error: unknown) => "refused" | "unknown";
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);

/** Stripe and Vapi errors that mean the request was answered and not carried out. */
export function classifyProviderError(error: unknown): "refused" | "unknown" {
  const e = error as { type?: string; statusCode?: number; message?: string } | null;
  if (e?.type) {
    if (e.type === "StripeConnectionError" || e.type === "StripeAPIError") return "unknown";
    const status = e.statusCode ?? 0;
    if (status === 409 || status >= 500) return "unknown";
    return status >= 400 || ["StripeCardError", "StripeInvalidRequestError", "StripeAuthenticationError", "StripePermissionError", "StripeRateLimitError", "StripeIdempotencyError"].includes(e.type) ? "refused" : "unknown";
  }
  const vapi = /Vapi API error \((\d{3})\)/.exec(e?.message ?? "");
  if (vapi) {
    const status = Number(vapi[1]);
    return status >= 400 && status < 500 && status !== 408 && status !== 409 ? "refused" : "unknown";
  }
  return "unknown";
}

async function fileException<T>(spec: EffectSpec<T>, effectId: string, reason: "response_lost" | "local_finalize_failed", providerId: string | null, idempotencyKey: string) {
  if (!spec.businessId) {
    logError("provider_effect.stuck_without_shop", { effectId, provider: spec.provider, operation: spec.operation, reason, providerId });
    return null;
  }
  return raiseReconciliation({
    businessId: spec.businessId,
    kind: spec.kind,
    entityType: spec.entity?.type ?? "provider_effect",
    entityId: spec.entity?.id ?? effectId,
    system: spec.provider,
    externalId: providerId,
    expected: { effect: spec.operation, effectId, recorded: true },
    observed: { reason, effectId, providerId, idempotencyKey },
  }).catch((error: unknown) => {
    logError("provider_effect.exception_failed", { effectId, error: message(error) });
    return null;
  });
}

async function closeException(effectId: string, exceptionId: string | null) {
  if (!exceptionId) return;
  await prisma.reconciliationException
    .updateMany({
      where: { id: exceptionId, status: "open" },
      data: { status: "resolved", resolvedBy: "system", resolution: `Recovered: the provider's record for effect ${effectId} was found and applied.`, resolvedAt: new Date() },
    })
    .catch(() => null);
}

/**
 * Make one provider effect happen at most once and land it on our side.
 * Serialized per correlation key across servers.
 */
export async function performOnce<T>(spec: EffectSpec<T>): Promise<T> {
  const classify = spec.classify ?? classifyProviderError;
  return withLease(
    `effect:${spec.provider}:${spec.correlationKey}`,
    async () => {
      let row = await prisma.providerEffect.upsert({
        where: { provider_correlationKey: { provider: spec.provider, correlationKey: spec.correlationKey } },
        create: {
          provider: spec.provider,
          operation: spec.operation,
          correlationKey: spec.correlationKey,
          idempotencyKey: spec.correlationKey,
          businessId: spec.businessId ?? null,
          entityType: spec.entity?.type ?? null,
          entityId: spec.entity?.id ?? null,
        },
        update: {},
      });

      const land = async (result: T) => {
        const providerId = spec.idOf(result);
        if (row.status !== "accepted" || row.providerId !== providerId) {
          row = await prisma.providerEffect.update({ where: { id: row.id }, data: { status: "accepted", providerId, lastError: null } });
        }
        try {
          await spec.finalize(result);
        } catch (error) {
          const exceptionId = row.exceptionId ?? (await fileException(spec, row.id, "local_finalize_failed", providerId, row.idempotencyKey));
          await prisma.providerEffect.update({ where: { id: row.id }, data: { lastError: `finalize: ${message(error)}`, exceptionId } }).catch(() => null);
          throw error;
        }
        await prisma.providerEffect.update({ where: { id: row.id }, data: { status: "finalized", finalizedAt: new Date(), lastError: null } });
        await closeException(row.id, row.exceptionId);
        return result;
      };

      if (row.status === "finalized" && row.providerId) return spec.retrieve(row.providerId);
      if (row.status === "accepted" && row.providerId) return land(await spec.retrieve(row.providerId));

      const mayHaveHappened = row.status === "uncertain" || (row.status === "pending" && row.attempts > 0);
      if (mayHaveHappened) {
        const replayable = spec.replayWindowMs > 0 && Date.now() - row.createdAt.getTime() < spec.replayWindowMs;
        if (!replayable) {
          let found: T | null;
          try {
            if (!spec.find) throw new Error("no way to look it up");
            found = await spec.find();
          } catch (error) {
            const exceptionId = row.exceptionId ?? (await fileException(spec, row.id, "response_lost", null, row.idempotencyKey));
            await prisma.providerEffect.update({ where: { id: row.id }, data: { status: "uncertain", exceptionId, lastError: `lookup: ${message(error)}` } });
            throw new UncertainEffectError(
              `An earlier ${spec.operation} may already have gone through and Orvius can't confirm it, so it was not sent again. It's flagged to check.`,
              row.id,
              exceptionId,
            );
          }
          if (found) return land(found);
        }
      }

      const idempotencyKey = row.status === "failed" || row.status === "reverted" ? `${spec.correlationKey}:r${row.attempts}` : row.idempotencyKey;
      row = await prisma.providerEffect.update({
        where: { id: row.id },
        data: { status: "pending", idempotencyKey, attempts: { increment: 1 } },
      });
      let result: T;
      try {
        result = await spec.perform(idempotencyKey);
      } catch (error) {
        if (classify(error) === "refused") {
          await prisma.providerEffect.update({ where: { id: row.id }, data: { status: "failed", lastError: message(error) } });
          throw error;
        }
        const exceptionId = row.exceptionId ?? (await fileException(spec, row.id, "response_lost", null, idempotencyKey));
        await prisma.providerEffect.update({ where: { id: row.id }, data: { status: "uncertain", lastError: message(error), exceptionId } });
        logWarn("provider_effect.uncertain", { effectId: row.id, provider: spec.provider, operation: spec.operation, error: message(error) });
        throw new UncertainEffectError(
          `Orvius didn't hear back from ${spec.provider === "stripe" ? "Stripe" : "the voice provider"}, so it may or may not have happened. It won't be repeated blindly; trying again checks first.`,
          row.id,
          exceptionId,
        );
      }
      return land(result);
    },
    { leaseMs: 60_000, waitMs: 30_000, forget: true },
  );
}

/** Our own rollback undid this effect (e.g. deleted the assistant), so the next attempt makes a new one. */
export async function revertEffect(provider: EffectProvider, correlationKey: string) {
  await prisma.providerEffect.updateMany({ where: { provider, correlationKey, status: { in: ["accepted", "finalized"] } }, data: { status: "reverted" } });
}

/** Effects that need a person: no reply, or accepted by the provider but not landed here. */
export async function stuckEffects(options: { businessId?: string; olderThanMs?: number; take?: number } = {}) {
  const before = new Date(Date.now() - (options.olderThanMs ?? 0));
  return prisma.providerEffect.findMany({
    where: {
      ...(options.businessId ? { businessId: options.businessId } : {}),
      OR: [{ status: "uncertain" }, { status: "accepted", updatedAt: { lt: before } }, { status: "pending", attempts: { gt: 0 }, updatedAt: { lt: new Date(Date.now() - 5 * 60_000) } }],
    },
    orderBy: { updatedAt: "desc" },
    take: options.take ?? 100,
  });
}
