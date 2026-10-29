import { randomBytes } from "node:crypto";
import { Prisma, type ProvisionAttempt } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isUniqueViolation } from "@/lib/unique-violation";

/** Longer than a provisioning run can take; a crashed run's lease lapses after this. */
export const PROVISION_LEASE_MS = 3 * 60 * 1000;

export class ProvisionBusyError extends Error {
  constructor() {
    super("Setup is already running for this shop. Give it a minute, then refresh.");
    this.name = "ProvisionBusyError";
  }
}

export const onboardingAttemptKey = (email: string) => `onboard:${email.toLowerCase().trim()}`;
export const shopLineAttemptKey = (businessId: string) => `line:${businessId}`;

/** Friendly name on the Twilio number; stays under Twilio's 64-character limit. */
export const lineFriendlyName = (tag: string) => `Orvius shop line ${tag}`;

/**
 * Take the lease for one paid provisioning run. Returns the attempt, including
 * anything an earlier run already bought, or throws ProvisionBusyError while
 * another run holds it. A run that already succeeded is returned as is.
 */
export async function claimProvisionAttempt(key: string, now = new Date()): Promise<ProvisionAttempt> {
  const leaseUntil = new Date(now.getTime() + PROVISION_LEASE_MS);
  if (!(await prisma.provisionAttempt.findUnique({ where: { key }, select: { key: true } }))) {
    try {
      return await prisma.provisionAttempt.create({
        data: { key, tag: randomBytes(6).toString("hex"), status: "running", leaseUntil },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  const taken = await prisma.provisionAttempt.updateMany({
    where: { key, status: { not: "succeeded" }, leaseUntil: { lte: now } },
    data: { status: "running", leaseUntil, attempts: { increment: 1 }, error: null },
  });
  const row = await prisma.provisionAttempt.findUniqueOrThrow({ where: { key } });
  if (taken.count === 0 && row.status !== "succeeded") throw new ProvisionBusyError();
  return row;
}

/** Save a purchase the moment it exists, so a crash after it can't lead to a second one. */
export async function recordProvisionStep(
  key: string,
  data: { phoneNumber?: string | null; vapiAssistantId?: string | null },
) {
  await prisma.provisionAttempt.update({ where: { key }, data });
}

export async function finishProvisionAttempt(
  key: string,
  outcome:
    | { status: "succeeded"; businessId: string }
    | { status: "failed"; error: string; keep: { phoneNumber: string | null; vapiAssistantId: string | null } },
) {
  await prisma.provisionAttempt.update({
    where: { key },
    data:
      outcome.status === "succeeded"
        ? { status: "succeeded", businessId: outcome.businessId, leaseUntil: new Date() }
        : {
            status: "failed",
            error: outcome.error.slice(0, 500),
            phoneNumber: outcome.keep.phoneNumber,
            vapiAssistantId: outcome.keep.vapiAssistantId,
            leaseUntil: new Date(),
          },
  });
}

/**
 * A short per-key lease for work that must not overlap but buys nothing,
 * such as creating or resetting a person's demo shop. Waits for the holder,
 * then runs; a crashed holder's lease lapses after `leaseMs`.
 */
export async function withLease<T>(
  key: string,
  run: () => Promise<T>,
  /** `forget` drops the lease row afterwards, for keys minted per record that would otherwise pile up. */
  options: { leaseMs?: number; waitMs?: number; forget?: boolean } = {},
): Promise<T> {
  const leaseMs = options.leaseMs ?? 30_000;
  const giveUpAt = Date.now() + (options.waitMs ?? 20_000);
  const tag = randomBytes(6).toString("hex");
  for (let pause = 25; ; pause = Math.min(pause * 2, 400)) {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + leaseMs);
    let held = false;
    if (!(await prisma.provisionAttempt.findUnique({ where: { key }, select: { key: true } }))) {
      try {
        await prisma.provisionAttempt.create({ data: { key, tag, status: "running", leaseUntil } });
        held = true;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    if (!held) {
      const taken = await prisma.provisionAttempt.updateMany({
        where: { key, leaseUntil: { lte: now } },
        data: { tag, status: "running", leaseUntil, attempts: { increment: 1 } },
      });
      held = taken.count === 1;
    }
    if (held) {
      try {
        return await run();
      } finally {
        if (options.forget) await prisma.provisionAttempt.deleteMany({ where: { key, tag } });
        else await prisma.provisionAttempt.updateMany({ where: { key, tag }, data: { status: "idle", leaseUntil: new Date(0) } });
      }
    }
    if (Date.now() >= giveUpAt) throw new ProvisionBusyError();
    await new Promise((resolve) => setTimeout(resolve, pause));
  }
}

/** The failure a run records when the number step broke; the purchase may have landed without its reply. */
export const LINE_STEP_FAILED = "Could not assign your dedicated shop line. Try again in a moment or contact support@orvius.im";

export type ProvisioningState = "running" | "failed_before_submission" | "failed_kept" | "outcome_unknown" | "succeeded";

export type ProvisioningStatus = {
  state: ProvisioningState;
  /** Running it again is safe: it takes the same attempt, so anything already bought is reused, never bought twice. */
  resume: boolean;
  reusesNumber: boolean;
  reusesReceptionist: boolean;
  attempts: number;
  error: string | null;
  updatedAt: string;
};

/**
 * Where a person's paid setup stands, read from its attempt row. A run whose
 * lease lapsed while "running" stopped without saying how far it got: it may
 * have bought a number, so that's unknown, not failed. A failure is "before
 * submission" only when nothing was bought and no provider call is in doubt.
 */
export async function provisioningStatus(email: string, now = new Date()): Promise<ProvisioningStatus | null> {
  const row = await prisma.provisionAttempt.findUnique({ where: { key: onboardingAttemptKey(email) } });
  if (!row) return null;
  const doubt = await prisma.providerEffect.findFirst({
    where: { correlationKey: `assistant:${row.tag}`, status: "uncertain" },
    select: { id: true },
  });
  const kept = Boolean(row.phoneNumber || row.vapiAssistantId);
  const lineInDoubt = row.status === "failed" && !row.phoneNumber && row.error === LINE_STEP_FAILED;
  const state: ProvisioningState =
    row.status === "succeeded"
      ? "succeeded"
      : row.status === "running" && row.leaseUntil > now
        ? "running"
        : row.status === "running" || doubt || lineInDoubt
          ? "outcome_unknown"
          : kept
            ? "failed_kept"
            : "failed_before_submission";
  return {
    state,
    resume: state !== "running" && state !== "succeeded",
    reusesNumber: Boolean(row.phoneNumber),
    reusesReceptionist: Boolean(row.vapiAssistantId),
    attempts: row.attempts,
    error: state === "failed_before_submission" || state === "failed_kept" ? row.error : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A line run can be repeated later (a shop may need a replacement number), so it resets after success. */
export async function reopenProvisionAttempt(key: string) {
  await prisma.provisionAttempt.deleteMany({ where: { key, status: "succeeded" } });
}
