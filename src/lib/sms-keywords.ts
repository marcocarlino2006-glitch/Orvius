/** Inbound SMS keyword handling — STOP / HELP / START (TCPA / carrier norms). */

export type SmsKeyword = "stop" | "help" | "start" | "join" | null;

const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "revoke", "optout"]);
const HELP_WORDS = new Set(["help", "info"]);
const START_WORDS = new Set(["start", "unstop"]);
/*
  A keyword is the whole message, the way carriers match it. "Cancel my
  appointment", "Help, the furnace died" and "End of day works" are customers
  talking to the shop. Plain-language opt-outs still count, since the FCC
  requires honoring any reasonable wording: "stop texting me", "please
  unsubscribe me", "remove me from your list".
*/
const STOP_PHRASES = [
  /^(please )?(stop|unsubscribe|quit)( it| now| please| thanks| thank you)*$/,
  /^(please )?(stop|quit|cease) (texting|messaging|sending|contacting|txting)( me| us)?( messages| texts)?( please| now)?$/,
  /^(please )?(do not|dont|don t|no more) (text|texts|message|messages|contact)( me| us)?( please| now)?$/,
  /^(please )?(remove|unsubscribe|take) me( off| from)?( (your|the|this) (list|texts|messages|number))?( please)?$/,
  /^(please )?opt (me )?out( please)?$/,
  /^wrong number( please)? stop$/,
];

function normalizeSms(body: string): string {
  return body
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSmsKeyword(body: string): SmsKeyword {
  const normalized = normalizeSms(body);
  if (!normalized) return null;
  const compact = normalized.replace(/\s/g, "");
  if (STOP_WORDS.has(compact) || STOP_PHRASES.some((re) => re.test(normalized))) return "stop";
  if (HELP_WORDS.has(compact)) return "help";
  if (START_WORDS.has(compact)) return "start";
  if (compact === "join") return "join";
  return null;
}

/** "Yes" alone re-subscribes only a number that is opted out; otherwise it is a reply to the shop. */
export function isBareYes(body: string): boolean {
  return /^(yes|y|yeah|yep)$/.test(normalizeSms(body));
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
