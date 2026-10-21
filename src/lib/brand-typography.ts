/** Brand typography — Inter everywhere; Plex Mono only for code and keys. */

export const brandWordmark = "orvius";

export const typeScale = {
  caption: "0.75rem",
  small: "0.8125rem",
  body: "0.9375rem",
  lead: "1.0625rem",
  title: "1.125rem",
  headline: "clamp(1.75rem, 3.2vw, 2.5rem)",
  display: "clamp(2.5rem, 5vw, 4.5rem)",
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
