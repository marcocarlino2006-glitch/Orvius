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

type ActivationBusiness = Pick<Business, "id" | "name" | "greeting" | "bookingMode" | "autopilot" | "followUpMode" | "transferPhone" | "setupJson">;

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

export function activationTerms(business: ActivationBusiness) {
  const notice = openingWithNotice(business.greeting ?? "", business.name);
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
