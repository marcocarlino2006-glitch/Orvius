import {
  buildForwardGuideSms,
  type CaptureMode,
  type CarrierId,
} from "@/lib/carrier-forward";
import { sendSms } from "@/lib/twilio-sms";
import type { Business } from "@prisma/client";

export type OwnerSetupStatus = {
  hasLine: boolean;
  hasOwnerPhone: boolean;
  captureConfirmed: boolean;
  lineVerified: boolean;
  ready: boolean;
  nextStep: "line" | "owner_phone" | "capture" | "verify" | "done";
  line: string | null;
};

export function getShopLine(business: {
  twilioPhone?: string | null;
  vapiPhoneNumber?: string | null;
}): string | null {
  const line =
    business.vapiPhoneNumber?.trim() || business.twilioPhone?.trim() || null;
  return line || null;
}

export function getOwnerSetupStatus(business: {
  twilioPhone?: string | null;
  vapiPhoneNumber?: string | null;
  ownerPhone?: string | null;
  overflowForwardConfirmedAt?: Date | string | null;
  lineVerifiedAt?: Date | string | null;
}): OwnerSetupStatus {
  const line = getShopLine(business);
  const hasLine = Boolean(line);
  const hasOwnerPhone = Boolean(business.ownerPhone?.trim());
  const captureConfirmed = Boolean(business.overflowForwardConfirmedAt);
  const lineVerified = Boolean(business.lineVerifiedAt);
  const ready = hasLine && hasOwnerPhone && captureConfirmed && lineVerified;

  let nextStep: OwnerSetupStatus["nextStep"] = "done";
  if (!hasLine) nextStep = "line";
  else if (!hasOwnerPhone) nextStep = "owner_phone";
  else if (!captureConfirmed) nextStep = "capture";
  else if (!lineVerified) nextStep = "verify";

  return {
    hasLine,
    hasOwnerPhone,
    captureConfirmed,
    lineVerified,
    ready,
    nextStep,
    line,
  };
}

export async function sendOwnerForwardGuide(params: {
  business: Pick<Business, "id" | "name" | "ownerPhone">;
  orviusLine: string;
  mode: CaptureMode;
  carrier?: CarrierId;
}): Promise<{ sent: boolean; reason?: string }> {
  const to = params.business.ownerPhone?.trim();
  if (!to) return { sent: false, reason: "no_owner_phone" };

  const body = buildForwardGuideSms({
    shopName: params.business.name,
    orviusLine: params.orviusLine,
    mode: params.mode,
    carrier: params.carrier,
  });

  const result = await sendSms({ to, body });
  if (!result) return { sent: false, reason: "sms_unavailable" };
  return { sent: true };
}
