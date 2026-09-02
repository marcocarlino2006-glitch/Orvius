import { DEMO_LINE_TEL } from "@/lib/demo-line";

/** Marketing demo line — always Summit HVAC, never assigned to signed-up shops. */
export function getDemoPlatformLine(): string | null {
  return process.env.TWILIO_PHONE_NUMBER?.trim() ?? DEMO_LINE_TEL;
}

export function normalizePhone(value: string | null | undefined): string {
  return value?.replace(/[^\d+]/g, "") ?? "";
}

export function isDemoPlatformLine(phone: string | null | undefined): boolean {
  const demo = getDemoPlatformLine();
  if (!demo || !phone) return false;
  return normalizePhone(phone) === normalizePhone(demo);
}

export function isDemoBusiness(business: { slug: string; name?: string }): boolean {
  if (business.slug === "summit-hvac-demo") return true;
  const demoName = process.env.ORVIUS_DEMO_BUSINESS_NAME?.trim();
  if (demoName && business.name?.trim().toLowerCase() === demoName.toLowerCase()) {
    return true;
  }
  return false;
}

/** True when this shop must not use the shared demo number. */
export function shopMustNotUseDemoLine(business: {
  slug: string;
  name?: string;
}): boolean {
  return !isDemoBusiness(business);
}

export function shopHasWrongDemoLine(business: {
  slug: string;
  name?: string;
  twilioPhone?: string | null;
  vapiPhoneNumber?: string | null;
}): boolean {
  if (!shopMustNotUseDemoLine(business)) return false;
  const line = business.vapiPhoneNumber ?? business.twilioPhone;
  return isDemoPlatformLine(line);
}
