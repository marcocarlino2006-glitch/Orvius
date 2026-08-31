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
