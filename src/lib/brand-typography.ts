/**
 * Brand typography. Geist is the face. The sizes are Cursor's words,
 * measured from cursor.com on 23 Oct 2026. Reading weight is 400.
 * The sentence is 26px. A paragraph is 16px. A label is 12px.
 */

export const brandWordmark = "orvius";

export const typeScale = {
  meta: "0.75rem",
  body: "0.875rem",
  lead: "1rem",
  name: "1.375rem",
  sentence: "1.625rem",
  section: "2.25rem",
  display: "3.25rem",
} as const;

/**
 * Brand lockup: the four-blade symbol beside the ORVIUS wordmark.
 * The symbol alone is the favicon and the app icon.
 * Each size is the font-size the lockup scales from.
 */
export const logoSizes = {
  sm: { mark: 22, word: "1.35rem", tracking: "-0.07em" },
  md: { mark: 28, word: "1.65rem", tracking: "-0.075em" },
  lg: { mark: 34, word: "1.9rem", tracking: "-0.08em" },
  xl: { mark: 52, word: "3rem", tracking: "-0.085em" },
} as const;
