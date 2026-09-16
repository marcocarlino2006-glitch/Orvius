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
  else if (!lineVerified) nextStep = "verify";
  else if (!captureConfirmed) nextStep = "capture";

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

export function ownerSetupHref(
  nextStep: OwnerSetupStatus["nextStep"],
): string {
  if (nextStep === "owner_phone") return "/dashboard/settings";
  if (nextStep === "done") return "/dashboard";
  return "/dashboard/onboarding";
}
