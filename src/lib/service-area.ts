/**
 * Service-area normalization + allowlist enforcement.
 *
 * Addresses arrive as whatever a caller said out loud. A ZIP is the coarsest
 * unit that is still local. When the owner sets serviceZipsJson, out-of-area
 * leads are rejected at book time — not theater.
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

/** Parse owner allowlist JSON — invalid / empty → []. */
export function parseServiceZips(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed
          .map((z) => String(z).replace(/\D/g, "").slice(0, 5))
          .filter((z) => /^\d{5}$/.test(z)),
      ),
    ];
  } catch {
    return [];
  }
}

export function serializeServiceZips(zips: string[]): string {
  return JSON.stringify(parseServiceZips(JSON.stringify(zips)));
}

/**
 * true  — address ZIP is in the allowlist
 * false — allowlist set and address ZIP missing or outside
 * null  — no allowlist configured (do not hard-reject)
 */
export function isInServiceArea(
  address: string | null | undefined,
  serviceZipsJson: string | null | undefined,
): boolean | null {
  const allowed = parseServiceZips(serviceZipsJson);
  if (!allowed.length) return null;
  const zip = extractPostalCode(address);
  if (!zip) return false;
  return allowed.includes(zip);
}
