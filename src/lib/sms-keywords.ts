/** Inbound SMS keyword handling — STOP / HELP / START (TCPA / carrier norms). */

export type SmsKeyword = "stop" | "help" | "start" | null;

const STOP_WORDS = new Set([
  "stop",
  "stopall",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
]);

const HELP_WORDS = new Set(["help", "info"]);

const START_WORDS = new Set(["start", "unstop", "yes"]);

export function parseSmsKeyword(body: string): SmsKeyword {
  const normalized = body
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return null;
  // Single-token or first token only (carriers expect STOP alone).
  const token = normalized.split(" ")[0] ?? "";
  if (STOP_WORDS.has(token) || STOP_WORDS.has(normalized.replace(/\s/g, ""))) {
    return "stop";
  }
  if (HELP_WORDS.has(token)) return "help";
  if (START_WORDS.has(token)) return "start";
  return null;
}

export function smsStopConfirmation(programName: string): string {
  return `You are unsubscribed from ${programName}. No more texts will be sent to this number. Reply START to re-subscribe. Msg&data rates may apply.`;
}

export function smsHelpReply(params: {
  programName: string;
  supportEmail: string;
}): string {
  return `${params.programName}: For help, email ${params.supportEmail}. Reply STOP to cancel. Msg&data rates may apply.`;
}

export function smsStartConfirmation(programName: string): string {
  return `You are re-subscribed to ${programName}. Reply STOP to cancel. Msg&data rates may apply.`;
}

/** Append carrier-friendly opt-out footer when missing. */
export function withSmsOptOutFooter(body: string): string {
  if (/\bSTOP\b/i.test(body)) return body;
  return `${body.trim()}\n\nReply STOP to opt out. Msg&data rates may apply.`;
}
