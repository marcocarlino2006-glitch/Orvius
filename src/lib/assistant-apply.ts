import type { Business } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { isOwnerDemoWorkspace } from "@/lib/demo-fence";
import { logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { buildBusinessAssistantConfig } from "@/lib/sync-business-assistant";
import { ensureVoiceMachine, machineKey, shopGetsOwnVoiceMachine, VoiceMachineColumnMissing } from "@/lib/voice-machine";
import { vapiRequest } from "@/lib/vapi";

/*
  Saving settings writes the shop's record. Applying them means the voice
  provider holds a receptionist built from exactly those settings. Only one
  thing proves the second: the provider's reply carrying the fingerprint of
  the config Orvius sent, recorded against the shop. A resolved request, a
  saved form or an old success for different settings is not that proof, and
  even a recorded success says what the receptionist took, not that calls are
  getting through now.
*/

export const APPLIED = "assistant.applied";
export const APPLY_FAILED = "assistant.apply_failed";

export type ReceptionistApply = {
  /**
   * applied: the provider confirmed these exact settings, and that is on record.
   * unconfirmed: saved; no record that the receptionist took this version.
   * failed: the last try for this version was refused or errored.
   * not_applicable: there is no live receptionist to apply to.
   */
  state: "applied" | "unconfirmed" | "failed" | "not_applicable";
  /** When the provider last confirmed this version. Historical, not a line health check. */
  appliedAt: string | null;
  error: string | null;
  /** The owner's next step, in their words; null when there is nothing to do. */
  next: string | null;
  /** Whether "Apply to receptionist" makes sense: a receptionist exists and the settings are saved. */
  canApply: boolean;
};

export function assistantFingerprint(business: Business): string | null {
  return buildBusinessAssistantConfig(business).metadata?.orviusConfig ?? null;
}

function notApplicable(business: Business): ReceptionistApply | null {
  if (isOwnerDemoWorkspace(business)) {
    return { state: "not_applicable", appliedAt: null, error: null, next: "Demo shop: there is no real receptionist, so calls here are simulated.", canApply: false };
  }
  if (!business.vapiAssistantId) {
    return { state: "not_applicable", appliedAt: null, error: null, next: "No receptionist yet. Settings are saved and are used when setup creates it.", canApply: false };
  }
  return null;
}

/** What the record says about the saved settings reaching the receptionist. Reads only Orvius's own rows. */
export async function receptionistApplyStatus(business: Business): Promise<ReceptionistApply> {
  const none = notApplicable(business);
  if (none) return none;
  const fingerprint = assistantFingerprint(business);
  const rows = await prisma.auditEvent.findMany({
    where: { businessId: business.id, entityType: "shop", entityId: business.id, action: { in: [APPLIED, APPLY_FAILED] } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { action: true, detailJson: true, createdAt: true },
  });
  const forThis = rows.filter((r) => fingerprint && detailOf(r.detailJson).fingerprint === fingerprint);
  const applied = forThis.find((r) => r.action === APPLIED) ?? null;
  const failed = forThis.find((r) => r.action === APPLY_FAILED) ?? null;
  if (applied && (!failed || failed.createdAt <= applied.createdAt)) {
    return { state: "applied", appliedAt: applied.createdAt.toISOString(), error: null, next: null, canApply: true };
  }
  if (failed) {
    const error = String(detailOf(failed.detailJson).error ?? "The voice provider refused the change.");
    return { state: "failed", appliedAt: null, error, next: "Your settings are saved. Apply them to the receptionist again; nothing about your phone line changes.", canApply: true };
  }
  return {
    state: "unconfirmed",
    appliedAt: null,
    error: null,
    next: "Your settings are saved, but there's no record the receptionist took this version. Apply them; nothing about your phone line changes.",
    canApply: true,
  };
}

/**
 * Send the saved settings to the shop's existing receptionist and record what
 * the provider said. Settings only: no number is bought, provisioned,
 * reattached or repaired here, whatever state the line is in.
 */
export async function applyReceptionistSettings(business: Business, by: { actor: "owner" | "teammate" | "system"; email?: string | null } = { actor: "system" }): Promise<ReceptionistApply> {
  const none = notApplicable(business);
  if (none) return none;
  let voiceMachineId: string | null = "voiceMachineId" in business ? ((business as { voiceMachineId?: string | null }).voiceMachineId ?? null) : null;
  if (shopGetsOwnVoiceMachine(business) && machineKey() && !voiceMachineId) {
    try {
      voiceMachineId = await ensureVoiceMachine(business.id);
    } catch (error) {
      if (!(error instanceof VoiceMachineColumnMissing)) throw error;
    }
  }
  const current = voiceMachineId ? { ...business, voiceMachineId } : business;
  const config = buildBusinessAssistantConfig(current);
  const fingerprint = config.metadata?.orviusConfig ?? null;
  let echoed: string | null = null;
  let error: string | null = null;
  let providerError: string | null = null;
  try {
    const reply = await vapiRequest<{ id?: string; metadata?: { orviusConfig?: string } }>(`/assistant/${business.vapiAssistantId}`, {
      method: "PATCH",
      body: JSON.stringify(config),
    });
    echoed = reply?.metadata?.orviusConfig ?? null;
    if (!fingerprint || echoed !== fingerprint) error = "The voice provider answered but didn't confirm these settings.";
  } catch (err) {
    providerError = err instanceof Error ? err.message.slice(0, 300) : "unknown";
    const status = /\((\d{3})\)/.exec(providerError)?.[1];
    error = status ? `The voice provider refused the change (error ${status}).` : "The voice provider didn't answer.";
  }

  try {
    await writeAudit({
      businessId: business.id,
      entityType: "shop",
      entityId: business.id,
      action: error ? APPLY_FAILED : APPLIED,
      actor: by.actor,
      actorEmail: by.email ?? null,
      summary: error ? `Receptionist didn't take the saved settings: ${error}` : "Receptionist took the saved settings.",
      detail: { fingerprint, echoed, error, providerError },
    });
  } catch (writeError) {
    logWarn("assistant.apply_unrecorded", { businessId: business.id, error: writeError instanceof Error ? writeError.message : "unknown" });
    return {
      state: "unconfirmed",
      appliedAt: null,
      error: error ?? null,
      next: error
        ? "Your settings are saved, but the receptionist didn't take them and Orvius couldn't record that. Apply them again."
        : "The receptionist took your settings, but Orvius couldn't record it, so this can't be shown as applied. Apply again to record it.",
      canApply: true,
    };
  }
  return receptionistApplyStatus(business);
}

/** A live check that found the receptionist already on these settings is the same evidence; one row per version a day. */
export async function recordLiveMatch(business: Business, fingerprint: string) {
  try {
    await writeAudit({
      businessId: business.id,
      entityType: "shop",
      entityId: business.id,
      action: APPLIED,
      actor: "system",
      summary: "Receptionist checked: it is on the saved settings.",
      detail: { fingerprint, echoed: fingerprint, error: null, source: "live_check" },
      idempotencyKey: `assistant-live:${business.id}:${fingerprint}:${new Date().toISOString().slice(0, 10)}`,
    });
  } catch (error) {
    logWarn("assistant.live_match_unrecorded", { businessId: business.id, error: error instanceof Error ? error.message : "unknown" });
  }
}

function detailOf(json: string | null): Record<string, unknown> {
  try {
    const v = JSON.parse(json ?? "null");
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
