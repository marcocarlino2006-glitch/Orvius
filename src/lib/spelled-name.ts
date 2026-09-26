/*
  Transcribers hear an unusual name as a common one ("Siobhan" → "Shivan"),
  and the model repeats what it heard. When the caller spells it letter by
  letter, the letters survive transcription, so the stored name is rebuilt
  from them rather than trusting either.
*/

const MIN_LETTERS = 3;
const MAX_SPAN = 3;
const CONTEXT_WORDS = 8;
/** Edit distance per spelled letter above which a spelling is about something else. */
const MAX_COST = 0.6;
/** Looser bar once the caller's own words next to the spelling show what it spells. */
const ANCHORED_MAX_COST = 0.85;

export type SpelledRun = {
  letters: string;
  /** The caller's words just before the spelling ("my name is Shivan Nguyen that's spelled"). */
  before: string[];
};

/** Letter-by-letter runs in what the caller said ("s I o b h a n", "N-G-U-Y-E-N", "double n"). */
export function spelledRuns(callerText: string): SpelledRun[] {
  const tokens = callerText.split(/[\s,.\-–—;:!?"]+/).filter(Boolean);
  const runs: SpelledRun[] = [];
  let letters = "";
  let startedAt = 0;
  const flush = (end: number) => {
    if (letters.length >= MIN_LETTERS) {
      runs.push({ letters: letters.toLowerCase(), before: tokens.slice(Math.max(0, startedAt - CONTEXT_WORDS), startedAt) });
    }
    letters = "";
    startedAt = end + 1;
  };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!letters) startedAt = i;
    if (/^[a-z]$/i.test(token)) letters += token;
    else if (/^double$/i.test(token) && /^[a-z]$/i.test(tokens[i + 1] ?? "")) letters += tokens[++i].repeat(2);
    else flush(i);
  }
  flush(tokens.length);
  return runs;
}

/** What the caller said, from a "User: … / AI: …" transcript. Untagged text is taken whole. */
export function callerLines(transcript: string | null | undefined) {
  if (!transcript) return "";
  const lines = transcript.split(/\r?\n/);
  const tagged = lines.filter((l) => /^(user|customer|caller)\s*:/i.test(l));
  if (!tagged.length && !lines.some((l) => /^(ai|assistant|bot)\s*:/i.test(l))) return transcript;
  return tagged.map((l) => l.replace(/^[^:]+:\s*/, "")).join("\n");
}

function distance(a: string, b: string) {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/* Names are misheard in the middle far more than at the start, so a cut that moves a first letter costs extra. */
function pieceCost(piece: string, word: string) {
  const w = word.toLowerCase();
  return distance(piece, w) + (piece[0] === w[0] ? 0 : 0.5);
}

/** Cheapest way to cut `letters` into one piece per word, and what it costs. */
function bestSplit(letters: string, words: string[]): { parts: string[]; cost: number } | null {
  if (words.length === 1) return { parts: [letters], cost: pieceCost(letters, words[0]) };
  let best: { parts: string[]; cost: number } | null = null;
  for (let k = 1; k <= letters.length - (words.length - 1); k++) {
    const head = pieceCost(letters.slice(0, k), words[0]);
    if (best && head >= best.cost) continue;
    const rest = bestSplit(letters.slice(k), words.slice(1));
    if (rest && (!best || head + rest.cost < best.cost)) best = { parts: [letters.slice(0, k), ...rest.parts], cost: head + rest.cost };
  }
  return best;
}

type Match = { start: number; len: number; parts: string[]; cost: number };

/** The run of consecutive words the letters spell best, cost per letter. */
function bestMatch(
  letters: string,
  words: string[],
  options: { skip?: (i: number) => boolean; len?: number } = {},
): Match | null {
  let best: Match | null = null;
  for (let start = 0; start < words.length; start++) {
    for (let len = 1; len <= MAX_SPAN && start + len <= words.length; len++) {
      if (options.skip?.(start + len - 1) || letters.length < len * 2) break;
      if (options.len && len !== options.len) continue;
      const split = bestSplit(letters, words.slice(start, start + len));
      if (!split) continue;
      const cost = split.cost / letters.length;
      if (!best || cost < best.cost) best = { start, len, parts: split.parts, cost };
    }
  }
  return best;
}

function styled(part: string, original: string) {
  if (part === original.toLowerCase()) return original;
  return part.charAt(0).toUpperCase() + part.slice(1);
}

/**
 * `text` with the words each spelled run best matches replaced by the spelling.
 * A run that matches nothing closely (an email, a code) changes nothing.
 */
export function applySpelledRuns(
  text: string | null | undefined,
  runs: SpelledRun[],
): { text: string | null; applied: SpelledRun[] } {
  if (!text) return { text: text ?? null, applied: [] };
  const pieces = text.split(/([A-Za-z\u00C0-\u024F']+)/);
  const wordAt = pieces.flatMap((p, i) => (i % 2 === 1 ? [i] : []));
  const used = new Set<number>();
  const applied: SpelledRun[] = [];

  for (const run of runs) {
    const spoken = bestMatch(run.letters, run.before.filter((w) => /^[A-Za-z\u00C0-\u024F']{2,}$/.test(w)));
    const anchored = spoken && spoken.cost <= MAX_COST ? spoken : null;
    const words = wordAt.map((i) => pieces[i]);
    const skip = (n: number) => used.has(wordAt[n]);
    const best = (anchored && bestMatch(run.letters, words, { skip, len: anchored.len })) || bestMatch(run.letters, words, { skip });
    if (!best) continue;
    const trusted = anchored && best.len === anchored.len;
    if (best.cost > (trusted ? ANCHORED_MAX_COST : MAX_COST)) continue;
    const parts = trusted ? anchored.parts : best.parts;
    applied.push(run);
    parts.forEach((part, n) => {
      const i = wordAt[best!.start + n];
      pieces[i] = styled(part, pieces[i]);
      used.add(i);
    });
  }
  return { text: pieces.join(""), applied };
}

/**
 * Name and address in the caller's own spelling. The name gets first claim on
 * each spelled run, so one spelling never rewrites both.
 */
export function withCallerSpelling(
  fields: { name?: string | null; address?: string | null },
  transcript: string | null | undefined,
) {
  const runs = spelledRuns(callerLines(transcript));
  if (!runs.length) return { name: fields.name ?? null, address: fields.address ?? null };
  const name = applySpelledRuns(fields.name, runs);
  const left = runs.filter((r) => !name.applied.includes(r));
  return { name: name.text, address: applySpelledRuns(fields.address, left).text };
}
