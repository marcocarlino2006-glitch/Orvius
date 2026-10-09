/*
  Call Replay: a preview call the owner shares. Only preview calls qualify —
  the caller is the owner trying their own line — so no customer's call is ever
  public. Pure, so the player can import it.
*/

export type ReplayTurn = { who: "ai" | "caller"; text: string; at: number | null };

export type ReplayCapture = { serviceType?: string; urgency?: string; firstName?: string; outcome?: string };

export type Replay = {
  id: string;
  shopName: string;
  trade: string;
  turns: ReplayTurn[];
  capture: ReplayCapture | null;
  /** "shop" is a real customer's call shared on the gallery; otherwise an owner's preview call. */
  kind?: "preview" | "shop";
};

const MAX_TURNS = 40;
const MAX_TURN_CHARS = 400;

/** Phone numbers, card-like digit runs and emails are masked before anything is public. */
export function maskForShare(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "•••")
    .replace(/\+?\(?\d[\d\s().-]{4,}\d/g, (run) => (run.replace(/\D/g, "").length >= 7 ? "•••" : run))
    .replace(/\s{2,}/g, " ")
    .trim();
}

const AI_ROLES = new Set(["bot", "assistant", "ai"]);
const CALLER_ROLES = new Set(["user", "customer", "caller"]);

export function replayTurns(input: {
  messages?: Array<{ role?: string; message?: string; secondsFromStart?: number }>;
  transcript?: string;
}): ReplayTurn[] {
  const turns: ReplayTurn[] = [];
  const push = (who: ReplayTurn["who"], raw: string, at: number | null) => {
    const text = raw.replace(/\s+/g, " ").trim().slice(0, MAX_TURN_CHARS);
    if (!text) return;
    const last = turns[turns.length - 1];
    if (last && last.who === who) last.text = `${last.text} ${text}`.slice(0, MAX_TURN_CHARS);
    else turns.push({ who, text, at });
  };

  if (input.messages?.length) {
    for (const m of input.messages) {
      const role = (m.role ?? "").toLowerCase();
      const who = AI_ROLES.has(role) ? "ai" : CALLER_ROLES.has(role) ? "caller" : null;
      if (who && m.message) push(who, m.message, typeof m.secondsFromStart === "number" ? m.secondsFromStart : null);
    }
  } else if (input.transcript) {
    for (const line of input.transcript.split(/\n+/)) {
      const match = line.match(/^\s*(AI|Assistant|Bot|User|Customer|Caller)\s*:\s*(.*)$/i);
      if (!match) continue;
      push(AI_ROLES.has(match[1].toLowerCase()) ? "ai" : "caller", match[2], null);
    }
  }
  return turns.slice(0, MAX_TURNS);
}

export function shareableTurns(turns: ReplayTurn[]): ReplayTurn[] {
  return turns.map((t) => ({ ...t, text: maskForShare(t.text) })).filter((t) => t.text);
}

/** Enough of a call to be worth watching: Orvius answered and the caller spoke. */
export function isReplayable(turns: ReplayTurn[]) {
  return turns.some((t) => t.who === "ai") && turns.some((t) => t.who === "caller") && turns.length >= 3;
}

const STREET =
  /\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){0,4}(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|way|court|ct|boulevard|blvd|place|pl|circle|cir|parkway|pkwy|highway|hwy|trail|trl|terrace|ter)\b\.?/gi;
const ZIP = /\b\d{5}(?:-\d{4})?\b/g;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A real customer's call, ready for strangers: numbers, emails, street
 * addresses, ZIPs and every word of the caller's known name and address hidden.
 */
export function maskCustomerCall(text: string, known: Array<string | null | undefined>): string {
  let out = maskForShare(text).replace(STREET, "•••").replace(ZIP, "•••");
  const words = new Set<string>();
  for (const value of known) {
    for (const word of (value ?? "").split(/[\s,]+/)) {
      const w = word.replace(/[^\p{L}\p{N}'-]/gu, "");
      if (w.length >= 2) words.add(w);
    }
  }
  for (const w of [...words].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(w)}(?![\\p{L}\\p{N}])`, "giu"), "•••");
  }
  return out.replace(/•••(?:[\s,]*•••)+/g, "•••");
}
