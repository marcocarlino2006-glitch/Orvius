import { normalizePhone } from "@/lib/customer";

export function phonesEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normalizePhone(a);
  const right = normalizePhone(b);
  if (!left || !right) return false;
  return left === right;
}

export function getShopLines(business: {
  twilioPhone?: string | null;
  vapiPhoneNumber?: string | null;
}): string[] {
  return [business.vapiPhoneNumber, business.twilioPhone].filter(
    (line): line is string => Boolean(line?.trim()),
  );
}

export function ownerPhoneConflictsWithShopLine(params: {
  ownerPhone?: string | null;
  shopLines: Array<string | null | undefined>;
}): boolean {
  const { ownerPhone, shopLines } = params;
  if (!ownerPhone?.trim()) return false;
  return shopLines.some((line) => phonesEqual(ownerPhone, line));
}

export function validateOwnerPhoneForAlerts(params: {
  ownerPhone?: string | null;
  shopLines: Array<string | null | undefined>;
}):
  | { ok: true }
  | { ok: false; reason: string } {
  const phone = params.ownerPhone?.trim();
  if (!phone) {
    return { ok: false, reason: "Owner mobile is required for SMS alerts" };
  }

  if (phone.length < 10) {
    return { ok: false, reason: "Enter a valid mobile number for owner alerts" };
  }

  if (ownerPhoneConflictsWithShopLine(params)) {
    return {
      ok: false,
      reason:
        "Owner mobile cannot be the same as your shop line — SMS alerts will not reach your cell",
    };
  }

  return { ok: true };
}
