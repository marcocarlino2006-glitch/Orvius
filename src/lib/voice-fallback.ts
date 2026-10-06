import { normalizePhone } from "@/lib/customer";

/**
 * The shop's phone to ring live, or null. Never the Orvius line itself, and
 * never the phone this call was just forwarded from: that phone already rang
 * out, and ringing it again would bounce the caller between the two forever.
 */
export function liveRingTarget(
  shop: { transferPhone: string | null; ownerPhone: string | null; twilioPhone: string | null; vapiPhoneNumber: string | null },
  call: { to: string; forwardedFrom: string },
): string | null {
  const skip = new Set(
    [call.to, call.forwardedFrom, shop.twilioPhone, shop.vapiPhoneNumber].map((p) => normalizePhone(p)).filter(Boolean),
  );
  for (const candidate of [shop.transferPhone, shop.ownerPhone]) {
    const phone = normalizePhone(candidate);
    if (phone?.startsWith("+") && !skip.has(phone)) return phone;
  }
  return null;
}
