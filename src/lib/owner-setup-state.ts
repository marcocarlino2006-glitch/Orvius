export type OwnerSetupStatus = {
  hasLine: boolean;
  hasOwnerPhone: boolean;
  captureConfirmed: boolean;
  lineVerified: boolean;
  /** Command opens: the line exists, alerts have a phone, and one call proved it. */
  ready: boolean;
  /** The receptionist is answering the number we assigned. An older number is optional. */
  live: boolean;
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
  // A real call to the number we assigned is the shop being live. Sending an
  // older advertised number here is optional and lives in Phone.
  const ready = hasLine && hasOwnerPhone && lineVerified;
  const live = ready;

  let nextStep: OwnerSetupStatus["nextStep"] = "done";
  if (!hasLine) nextStep = "line";
  else if (!hasOwnerPhone) nextStep = "owner_phone";
  else if (!lineVerified) nextStep = "verify";

  return {
    hasLine,
    hasOwnerPhone,
    captureConfirmed,
    lineVerified,
    ready,
    live,
    nextStep,
    line,
  };
}

export function ownerSetupHref(
  nextStep: OwnerSetupStatus["nextStep"],
): string {
  if (nextStep === "owner_phone") return "/dashboard?settings=notifications";
  if (nextStep === "capture") return "/dashboard?settings=phone";
  if (nextStep === "done") return "/dashboard";
  return "/dashboard/onboarding";
}
