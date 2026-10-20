/*
 * Pull a street address out of free text — a customer's text message, most
 * often. Deliberately conservative: a house number, a street name, and a
 * known suffix must all be present, so "call me after 5" or "apt 4" never
 * becomes an address. City/state/ZIP are appended when the writer included
 * them, in the forms people actually type ("Evanston", "Evanston, IL",
 * "Evanston IL 60201", "Evanston, IL 60201").
 */
const SUFFIX = "(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Ct|Court|Way|Hwy|Highway|Pl|Place|Cir|Circle|Ter|Terrace)";
const STREET_RE = new RegExp(
  `\\b\\d{1,6}\\s+[A-Za-z0-9.'-]+(?:\\s+[A-Za-z0-9.'-]+){0,3}\\s+${SUFFIX}\\b` +
    `(?:\\s*,?\\s+(?:Apt|Apartment|Unit|Ste|Suite|#)\\s*[A-Za-z0-9-]+)?`,
  "i",
);
const SUFFIX_PATTERNS = [
  /^,\s*([A-Za-z][A-Za-z .'-]{1,30}?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/, // , City, ST 60201
  /^,\s*([A-Za-z][A-Za-z .'-]{1,30}?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/, // , City ST 60201
  /^,\s*([A-Za-z][A-Za-z .'-]{1,30}?),\s*([A-Z]{2})\b/, // , City, ST
  /^,\s*([A-Za-z][A-Za-z .'-]{1,30}?)(?=[.!?]|$|\s+[-—])/, // , City.
  /^\s+(\d{5}(?:-\d{4})?)\b/, // 60201 directly after the street
];

export function extractStreetAddress(text: string | null | undefined): string | null {
  if (!text) return null;
  const clean = text.replace(/\s+/g, " ");
  const match = STREET_RE.exec(clean);
  if (!match) return null;
  let found = match[0].trim();
  // A match that is only a number and a suffix ("5 Way") is not an address.
  if (found.split(" ").length < 3) return null;
  const rest = clean.slice(match.index + match[0].length);
  for (const pattern of SUFFIX_PATTERNS) {
    const tail = pattern.exec(rest);
    if (tail) {
      found += pattern === SUFFIX_PATTERNS[4] ? ` ${tail[1]}` : `, ${tail.slice(1).join(", ").replace(/, (\d{5})/, " $1")}`;
      break;
    }
  }
  return found.replace(/\s+/g, " ").trim();
}
