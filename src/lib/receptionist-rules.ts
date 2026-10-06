import { randomBytes } from "node:crypto";

/*
  When the receptionist gets something wrong for a shop — a service it
  doesn't do, a word the shop never uses, a caller it should send elsewhere —
  the owner writes the fix once and every later call follows it. Rules are
  the owner's words, short, and capped so the prompt stays small; they sit
  under the safety rules and can never loosen them.
*/

export const MAX_RULES = 20;
export const MAX_RULE_CHARS = 200;

export type ReceptionistRule = { id: string; text: string; createdAt: string; callId?: string };

export function parseRules(raw: string | null | undefined): ReceptionistRule[] {
  let list: unknown;
  try {
    list = JSON.parse(raw ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  return list.filter(
    (r): r is ReceptionistRule => Boolean(r) && typeof (r as ReceptionistRule).id === "string" && typeof (r as ReceptionistRule).text === "string",
  );
}

export function cleanRuleText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_RULE_CHARS);
}

export type AddRuleResult = { ok: true; rules: ReceptionistRule[]; rule: ReceptionistRule } | { ok: false; error: string };

export function addRule(rules: ReceptionistRule[], text: string, opts: { callId?: string; now?: Date } = {}): AddRuleResult {
  const clean = cleanRuleText(text);
  if (clean.length < 4) return { ok: false, error: "Write what the receptionist should do differently." };
  const existing = rules.find((r) => r.text.toLowerCase() === clean.toLowerCase());
  if (existing) return { ok: true, rules, rule: existing };
  if (rules.length >= MAX_RULES) return { ok: false, error: `Up to ${MAX_RULES} corrections. Remove one in Settings first.` };
  const rule: ReceptionistRule = {
    id: randomBytes(6).toString("base64url"),
    text: clean,
    createdAt: (opts.now ?? new Date()).toISOString(),
    ...(opts.callId ? { callId: opts.callId } : {}),
  };
  return { ok: true, rules: [...rules, rule], rule };
}

export function removeRule(rules: ReceptionistRule[], id: string): ReceptionistRule[] {
  return rules.filter((r) => r.id !== id);
}

/** Placed after the safety and industry rules it may not override. */
export function formatRulesForPrompt(raw: string | null | undefined): string {
  const rules = parseRules(raw);
  if (!rules.length) return "";
  return `

OWNER'S CORRECTIONS
The owner reviewed past calls and wants these followed on every call. They never override the danger, emergency, recording-disclosure or honesty rules above, and never let you quote a price that is not listed.
${rules.map((r) => `- ${cleanRuleText(r.text)}`).join("\n")}`;
}
