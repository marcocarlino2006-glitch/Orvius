/**
 * Service-area normalization.
 *
 * Addresses arrive as whatever a caller said out loud, so "what does a water
 * heater cost around here" has no answer while geography is free text. A ZIP
 * is the coarsest unit that is still local, cheap to derive, and stable enough
 * to group on years from now.
 */

/** Lowest and highest allocated US ZIP codes — filters stray 5-digit runs. */
const MIN_ZIP = 501;
const MAX_ZIP = 99950;

const FIVE_DIGITS = /(?<!\d)(\d{5})(?!\d)/g;

/**
 * Pull a US ZIP out of a free-text address, or null when there isn't one.
 *
 * US addresses put the ZIP last, so the last candidate wins. A lone leading
 * number is a street number ("1234 Elm St"), not a ZIP, and guessing there
 * would file half a city under a house number.
 */
export function extractPostalCode(address: string | null | undefined) {
  const text = (address ?? "").trim();
  if (!text) return null;

  const found: Array<{ zip: string; index: number }> = [];
  for (const match of text.matchAll(FIVE_DIGITS)) {
    const zip = match[1];
    const value = Number(zip);
    if (value < MIN_ZIP || value > MAX_ZIP) continue;
    found.push({ zip, index: match.index ?? 0 });
  }

  if (!found.length) return null;

  const trailing = found.filter((candidate) => candidate.index > 0);
  if (trailing.length) return trailing[trailing.length - 1].zip;

  // Only candidate sits at the start: a bare ZIP is fine, "12345 Elm St" isn't.
  const only = found[0];
  return only.zip.length === text.length ? only.zip : null;
}

/**
 * Coarser grouping for when one ZIP has too few jobs to say anything. The
 * first three digits of a US ZIP are a sectional center — roughly a metro.
 */
export function postalSector(postalCode: string | null | undefined) {
  const zip = (postalCode ?? "").trim();
  return /^\d{5}$/.test(zip) ? zip.slice(0, 3) : null;
}
