/*
  Call Replay: a preview call the owner shares. Only preview calls qualify —
  the caller is the owner trying their own line — so no customer's call is ever
  public. Pure, so the player can import it.
*/

export type ReplayTurn = { who: "ai" | "caller"; text: string; at: number | null };

export type ReplayCapture = { serviceType?: string; urgency?: string; firstName?: string };

export type Replay = {
  id: string;
  shopName: string;
  trade: string;
  turns: ReplayTurn[];
  capture: ReplayCapture | null;
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
