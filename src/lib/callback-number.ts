import { parseTranscript } from "@/lib/transcript";

/**
 * Whose number is it? The receptionist cannot see caller ID, so any phone
 * number it reads out has to come from the caller's own words. A number the
 * caller never said is invented — the September 26 call read "1234567890"
 * back after "just use the number I'm calling from" — and if the model then
 * extracts that number, the owner calls a stranger back.
 */

const DIGIT_WORDS: Record<string, string> = {
  zero: "0", oh: "0", o: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9",
  cero: "0", uno: "1", dos: "2", tres: "3", cuatro: "4", cinco: "5",
  seis: "6", siete: "7", ocho: "8", nueve: "9",
};

/**
 * Runs of digits as spoken: "312-555-0147", "(312) 555 0147" and "three one
 * two, five five five…" all become one run. Words other than digit words
 * break a run, so "1812 Chicago Avenue, 60201" stays two short runs.
 */
export function digitRuns(text: string): string[] {
  const tokens = text.toLowerCase().match(/[a-zñ]+|\d+|[^\sa-zñ\d]/g) ?? [];
  const runs: string[] = [];
  let cur = "";
  let pendingDouble = false;
  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      cur += token;
      continue;
    }
    const word = DIGIT_WORDS[token];
    if (word) {
      cur += pendingDouble ? word + word : word;
      pendingDouble = false;
      continue;
    }
    if (token === "double" && cur) {
      pendingDouble = true;
      continue;
    }
    if (/^[-().,+/]$/.test(token)) continue;
    if (cur) runs.push(cur);
    cur = "";
    pendingDouble = false;
  }
  if (cur) runs.push(cur);
  return runs;
}

/** A run long enough to be a phone number rather than a house number, zip or time. */
const PHONE_RUN = 7;

const tail = (digits: string, n = PHONE_RUN) => digits.replace(/\D/g, "").slice(-n);

/** "Just use the number I'm calling from", in the ways callers actually say it. */
export const USE_CALLING_NUMBER =
  /\b(use|call( me)?( back)? (on|at)|same as|it'?s) (the |this |my )?(same )?(number|one|phone|line|cell)( that)? (i'?m|i am|i'?ve been) (calling|ringing) (you )?(from|on|with)\b|\b(this|the same) (number|phone|line)\b.{0,20}\b(is fine|works|is good|is best|is ok(ay)?)\b|\b(caller id|the number (you|that) (see|have|got))\b|\bel (mismo )?n[uú]mero (del que|de donde|desde el que) (llamo|estoy llamando)\b/i;

/** The national number: "+1 (312) 555-0147", "13125550147" and "312.555.0147" are all "3125550147". */
export function nationalNumber(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

/** Same full phone number. Shared last seven digits with a different area code is a different person. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = nationalNumber(a);
  const y = nationalNumber(b);
  return x.length >= 10 && x === y;
}

/**
 * The caller said this whole number: its full national digits appear in one
 * spoken run, or across the runs of one caller turn ("three one two… uh…
 * five five five, oh one four seven"). Seven spoken digits cannot vouch for
 * an area code the caller never said.
 */
export function callerSaid(transcript: string | null | undefined, phone: string | null | undefined): boolean {
  return callerLinesSaid(
    parseTranscript(transcript).filter((l) => l.role === "caller").map((l) => l.text),
    phone,
  );
}

export function callerLinesSaid(lines: string[], phone: string | null | undefined): boolean {
  const want = nationalNumber(phone);
  if (want.length < 10) return false;
  return lines.some((text) => {
    const runs = digitRuns(text);
    return runs.some((run) => run.includes(want)) || runs.join("").includes(want);
  });
}

/** The caller asked the shop to use the number they are calling from. */
export function callerUsedCallingNumber(transcript: string | null | undefined): boolean {
  return parseTranscript(transcript).some((l) => l.role === "caller" && USE_CALLING_NUMBER.test(l.text));
}

/**
 * Phone-length numbers the receptionist read out that the caller never said.
 * `allowed` is numbers it may legitimately say (the shop's own line).
 */
export function inventedNumbers(transcript: string | null | undefined, allowed: Array<string | null | undefined> = []): string[] {
  const lines = parseTranscript(transcript);
  const said = lines.filter((l) => l.role === "caller").flatMap((l) => digitRuns(l.text));
  const ok = allowed.map((n) => tail(n ?? "")).filter((t) => t.length === PHONE_RUN);
  const invented: string[] = [];
  for (const line of lines) {
    if (line.role !== "ai") continue;
    for (const run of digitRuns(line.text)) {
      if (run.length < PHONE_RUN) continue;
      const t = tail(run);
      if (said.some((s) => s.includes(t) || (s.length >= PHONE_RUN && run.includes(tail(s))))) continue;
      if (ok.includes(t)) continue;
      invented.push(line.text);
      break;
    }
  }
  return invented;
}

export type CallbackSource = "caller_words" | "caller_id" | "none";

export type TrustedCallback = {
  phone: string | null;
  /** A model-supplied number was dropped for the inbound caller ID. */
  replaced: boolean;
  /** No trustworthy number: the owner must check the call before calling back. */
  withheld: boolean;
  source: CallbackSource;
};

/**
 * The callback number, from caller words or verified inbound identity only.
 * A model-supplied number survives when it is the full caller-ID number or
 * the caller said every digit of it; anything else yields to caller ID, and
 * with no caller ID it is withheld for review rather than trusted.
 */
export function trustedCallbackNumber(input: {
  extracted: string | null | undefined;
  callerId: string | null | undefined;
  transcript?: string | null | undefined;
  callerLines?: string[];
}): TrustedCallback {
  const extracted = input.extracted?.trim() || null;
  const callerId = nationalNumber(input.callerId).length >= 10 ? input.callerId!.trim() : null;
  const said = (phone: string) =>
    input.callerLines ? callerLinesSaid(input.callerLines, phone) : callerSaid(input.transcript, phone);
  if (!extracted) {
    return callerId
      ? { phone: callerId, replaced: false, withheld: false, source: "caller_id" }
      : { phone: null, replaced: false, withheld: false, source: "none" };
  }
  if (callerId && samePhone(extracted, callerId)) return { phone: callerId, replaced: false, withheld: false, source: "caller_id" };
  if (said(extracted)) return { phone: extracted, replaced: false, withheld: false, source: "caller_words" };
  if (callerId) return { phone: callerId, replaced: true, withheld: false, source: "caller_id" };
  return { phone: null, replaced: false, withheld: true, source: "none" };
}
