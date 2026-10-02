/** Summit HVAC live demo — product IS the marketing. */
export const DEMO_LINE_DISPLAY = "+1 844 643 9170";
export const DEMO_LINE_TEL = "+18446439170";
export const DEMO_LINE_BUSINESS = "Summit HVAC";

export function demoLineHref() {
  return `tel:${DEMO_LINE_TEL}`;
}

export function telHref(phone: string) {
  const normalized = phone.replace(/[^\d+]/g, "");
  return `tel:${normalized}`;
}

/** Same shape as DEMO_LINE_DISPLAY, safe to import from client components. */
export function displayLine(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10) return `+1 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return phone;
}
