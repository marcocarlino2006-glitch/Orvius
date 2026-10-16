import { createHash } from "node:crypto";
import type { Business } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { permissionLevelFor } from "@/lib/setup-flow";
import { openingWithNotice } from "@/lib/vapi";

/*
  Turning a shop on is the moment it starts answering real callers, so what
  the owner approved is kept on our side: the exact notice callers will hear,
  the permissions it will act with, who approved and when. The versions are
  hashes of what the server will actually run, so an approval of a screen that
  has since changed is refused instead of carried forward.
*/

export const TERMS_DOCUMENT_VERSION = "terms-privacy-refunds-2026-01";

/** The greeting a new shop starts with; activation terms for a shop not yet built are computed from it. */
export function defaultGreeting(name: string) {
  return `Thank you for calling ${name}. How can I help you today?`;
}

type ActivationBusiness = Pick<Business, "id" | "name" | "greeting" | "bookingMode" | "autopilot" | "followUpMode" | "transferPhone" | "setupJson">;

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

export function activationTerms(business: ActivationBusiness) {
  // A shop with no greeting of its own goes live with the starting one, so that is what is approved.
  const notice = openingWithNotice(business.greeting?.trim() || defaultGreeting(business.name), business.name);
  const permissions = {
    level: permissionLevelFor(business),
    bookingMode: business.bookingMode ?? null,
    followUps: business.followUpMode ?? null,
    transfer: Boolean(business.transferPhone?.trim()),
  };
  return {
    notice,
    permissions,
    noticeVersion: `notice-${digest(notice)}`,
    setupVersion: `setup-${digest(permissions)}`,
  };
}

export function activationVersions(business: ActivationBusiness) {
  const { noticeVersion, setupVersion } = activationTerms(business);
  return { noticeVersion, setupVersion };
}

export type ActivationClaim = { recording: true; approved: true; noticeVersion: string; setupVersion: string };

export type ActivationRefusal = { code: "activation_missing" | "activation_stale"; error: string };

/** The settings a shop not yet built will run with: the database defaults and the starting greeting. */
export function draftActivationBusiness(name: string, greeting?: string | null): ActivationBusiness {
  return { id: "", name, greeting: greeting?.trim() || defaultGreeting(name), bookingMode: "book", autopilot: true, followUpMode: "ask", transferPhone: null, setupJson: null };
}

export function checkActivationClaim(business: ActivationBusiness, claim: Partial<ActivationClaim> | null | undefined): ActivationRefusal | null {
  if (!claim || claim.recording !== true || claim.approved !== true || !claim.noticeVersion || !claim.setupVersion) {
    return { code: "activation_missing", error: "Approve the call notice and turning Orvius on before choosing a plan." };
  }
  const current = activationTerms(business);
  if (claim.noticeVersion !== current.noticeVersion || claim.setupVersion !== current.setupVersion) {
    return { code: "activation_stale", error: "Your notice or permissions changed since you approved them. Review them and approve again." };
  }
  return null;
}

export async function recordActivationAck(params: {
  business: ActivationBusiness;
  actorEmail: string;
  acceptedTerms: boolean;
  acceptedSms: boolean;
  now?: Date;
}) {
  const terms = activationTerms(params.business);
  return prisma.activationAcknowledgement.create({
    data: {
      businessId: params.business.id,
      actorEmail: params.actorEmail.toLowerCase(),
      noticeVersion: terms.noticeVersion,
      noticeText: terms.notice,
      setupVersion: terms.setupVersion,
      permissionsJson: JSON.stringify(terms.permissions),
      termsVersion: TERMS_DOCUMENT_VERSION,
      acceptedRecording: true,
      approvedTurnOn: true,
      acceptedTerms: params.acceptedTerms,
      acceptedSms: params.acceptedSms,
      createdAt: params.now ?? new Date(),
    },
  });
}

/** The paid checkout found its approval; a turn-on without one is surfaced, not silently trusted. */
export async function bindActivationAck(params: { ackId: string | null | undefined; businessId: string; actorEmail: string; checkoutSessionId: string }) {
  if (!params.ackId) return { bound: false as const, reason: "missing" };
  const bound = await prisma.activationAcknowledgement.updateMany({
    where: { id: params.ackId, businessId: params.businessId, actorEmail: params.actorEmail.toLowerCase(), checkoutSessionId: null },
    data: { checkoutSessionId: params.checkoutSessionId },
  });
  if (bound.count) return { bound: true as const };
  const already = await prisma.activationAcknowledgement.findFirst({
    where: { id: params.ackId, businessId: params.businessId, checkoutSessionId: params.checkoutSessionId },
    select: { id: true },
  });
  return already ? { bound: true as const } : { bound: false as const, reason: "mismatch" };
}

export type OperatorAttestation = { ownerEmail: string; method: "written" | "call" | "in_person"; reference: string };

/**
 * What a request to turn a shop on carries as its approval: an approval
 * already on record (the test-shop checkout), a fresh claim of the versions
 * the owner saw, or an Orvius operator recording an approval the owner gave
 * elsewhere. Checked against the shop that will actually run.
 */
export type ShopActivation = {
  actorEmail: string;
  ackId?: string | null;
  claim?: Partial<ActivationClaim> | null;
  operator?: OperatorAttestation | null;
  acceptedTerms: boolean;
  acceptedSms: boolean;
  checkoutSessionId?: string | null;
  at?: Date | null;
};

export class ActivationRequiredError extends Error {
  readonly code: ActivationRefusal["code"];
  readonly terms: { notice: string; noticeVersion: string; setupVersion: string };
  constructor(refusal: ActivationRefusal, business: ActivationBusiness) {
    super(refusal.error);
    this.name = "ActivationRequiredError";
    this.code = refusal.code;
    const { notice, noticeVersion, setupVersion } = activationTerms(business);
    this.terms = { notice, noticeVersion, setupVersion };
  }
}

export type SettledActivation =
  | { kind: "recorded"; ackId: string; checkoutSessionId: string | null }
  | { kind: "new"; data: Omit<Parameters<typeof prisma.activationAcknowledgement.create>[0]["data"], "businessId"> };

/**
 * Decide, before anything is bought or built, whether this activation is
 * approved for exactly the shop that will run. Throws ActivationRequiredError
 * otherwise. Writes nothing: the caller records the result in the same
 * transaction that makes the shop live.
 */
export async function settleActivation(
  business: ActivationBusiness,
  activation: ShopActivation | null | undefined,
  options: { existingBusinessId?: string | null } = {},
): Promise<SettledActivation> {
  if (!activation?.actorEmail) throw new ActivationRequiredError(checkActivationClaim(business, null)!, business);
  const actorEmail = activation.actorEmail.trim().toLowerCase();
  const terms = activationTerms(business);
  let stale = false;
  if (activation.ackId && options.existingBusinessId && !activation.operator) {
    const row = await prisma.activationAcknowledgement.findFirst({
      where: { id: activation.ackId, businessId: options.existingBusinessId, actorEmail, actorKind: "owner" },
      select: { id: true, noticeVersion: true, setupVersion: true, checkoutSessionId: true },
    });
    const sameCheckout = !row?.checkoutSessionId || row.checkoutSessionId === (activation.checkoutSessionId ?? null);
    if (row && sameCheckout && row.noticeVersion === terms.noticeVersion && row.setupVersion === terms.setupVersion) {
      return { kind: "recorded", ackId: row.id, checkoutSessionId: activation.checkoutSessionId ?? null };
    }
    stale = Boolean(row);
  }
  const refusal = checkActivationClaim(business, activation.claim);
  if (refusal) {
    throw new ActivationRequiredError(stale && refusal.code === "activation_missing" ? { code: "activation_stale", error: "Your notice or permissions changed since you approved them. Review them and approve again." } : refusal, business);
  }
  if (activation.operator) {
    const { ownerEmail, method, reference } = activation.operator;
    if (!ownerEmail?.includes("@") || !["written", "call", "in_person"].includes(method) || !reference?.trim()) {
      throw new ActivationRequiredError({ code: "activation_missing", error: "Record whose approval this is, how it was given and where it is kept." }, business);
    }
  }
  return {
    kind: "new",
    data: {
      actorEmail,
      actorKind: activation.operator ? "operator" : "owner",
      attestationJson: activation.operator
        ? JSON.stringify({ ownerEmail: activation.operator.ownerEmail.trim().toLowerCase(), method: activation.operator.method, reference: activation.operator.reference.trim() })
        : null,
      noticeVersion: terms.noticeVersion,
      noticeText: terms.notice,
      setupVersion: terms.setupVersion,
      permissionsJson: JSON.stringify(terms.permissions),
      termsVersion: TERMS_DOCUMENT_VERSION,
      acceptedRecording: true,
      approvedTurnOn: true,
      acceptedTerms: activation.acceptedTerms,
      acceptedSms: activation.acceptedSms,
      checkoutSessionId: activation.checkoutSessionId ?? null,
      createdAt: activation.at ?? new Date(),
    },
  };
}

type AckTx = Pick<typeof prisma, "activationAcknowledgement">;

/** Record a settled activation inside the transaction that makes the shop live. */
export async function recordSettledActivation(tx: AckTx, businessId: string, settled: SettledActivation) {
  if (settled.kind === "new") {
    return (await tx.activationAcknowledgement.create({ data: { ...settled.data, businessId } })).id;
  }
  if (settled.checkoutSessionId) {
    await tx.activationAcknowledgement.updateMany({
      where: { id: settled.ackId, businessId, checkoutSessionId: null },
      data: { checkoutSessionId: settled.checkoutSessionId },
    });
  }
  return settled.ackId;
}

/** The approval Stripe carried for a paid checkout, read back from its metadata. */
export function activationFromCheckoutMetadata(
  metadata: Record<string, string> | null | undefined,
  params: { email: string; sessionId: string },
): ShopActivation {
  const m = metadata ?? {};
  const at = m.activation_at ? new Date(m.activation_at) : null;
  return {
    actorEmail: params.email,
    ackId: m.activation_ack || null,
    claim:
      m.activation_notice && m.activation_setup
        ? { recording: true, approved: true, noticeVersion: m.activation_notice, setupVersion: m.activation_setup }
        : null,
    acceptedTerms: Boolean(m.shop_consent_at),
    acceptedSms: Boolean(m.shop_consent_at),
    checkoutSessionId: params.sessionId,
    at: at && !Number.isNaN(at.getTime()) ? at : null,
  };
}
