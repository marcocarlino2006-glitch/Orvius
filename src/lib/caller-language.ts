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

const SPANISH_WORDS = new Set(
  "el la los las del que en un una mi mis es está esta estoy tengo tiene necesito quiero puede pueden por para con sin sí bueno buenas hola gracias casa calle mañana tarde noche hoy lunes martes miércoles jueves viernes sábado domingo hora horas funciona agua aire calor frío llamo llamar nombre número dirección también pero muy bien".split(" "),
);

function spanishLine(text: string) {
  if (SPANISH.test(text)) return true;
  const words = text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  const hits = words.filter((word) => SPANISH_WORDS.has(word)).length;
  // A Spanish street or business name inside an English sentence is not Spanish.
  return hits >= 2 && hits / words.length >= 0.3;
}

/**
 * Mid-call, from the caller's own lines only: is the caller speaking Spanish
 * now? Judged on their last few lines, so a caller who switched language
 * mid-call is answered in the one they switched to.
 */
export function callerSpeakingSpanish(callerWords: string | null | undefined): boolean {
  const lines = (callerWords ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.split(/\s+/).length >= 2)
    .slice(-3);
  if (!lines.length) return false;
  return lines.filter(spanishLine).length * 2 > lines.length || spanishLine(lines[lines.length - 1]);
}
