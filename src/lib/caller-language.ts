import { parseTranscript } from "@/lib/transcript";

const SPANISH = /\b(hola|gracias|por favor|calefacci[oó]n|aire acondicionado|no funciona|mi casa|necesito|se[nñ]or|se[nñ]ora|buenas)\b/i;

/**
 * The caller spoke Spanish on at least half their lines. The receptionist's
 * own lines do not count: a bilingual greeting from Orvius is not the caller.
 * Silence and an English transcript stay false.
 */
export function callerSpokeSpanish(transcript: string | null | undefined): boolean {
  const caller = parseTranscript(transcript).filter((line) => line.role === "caller");
  if (!caller.length) return false;
  return caller.filter((line) => SPANISH.test(line.text)).length * 2 >= caller.length;
}
