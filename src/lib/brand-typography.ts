/** Brand typography — Orbitron wordmark + dual-rail O (substitutes the letter). */

export const brandWordmark = "Orvius";

export const typeScale = {
  caption: "0.8125rem",
  small: "0.875rem",
  body: "0.9375rem",
  lead: "1.0625rem",
  title: "1.125rem",
  headline: "clamp(1.75rem, 3.2vw, 2.5rem)",
  display: "clamp(2.75rem, 5.5vw, 4.25rem)",
} as const;

/**
 * Two logo lines (X.com pattern):
 * 1) Mark alone — dual-rail O
 * 2) Integrated — mark replaces O → [O]RVIUS
 * Mark size tracks capital height of the wordmark.
 */
export const logoSizes = {
  sm: { mark: 22, wordmark: "1rem", tracking: "0.16em" },
  md: { mark: 26, wordmark: "1.125rem", tracking: "0.18em" },
  lg: { mark: 32, wordmark: "1.35rem", tracking: "0.2em" },
  xl: { mark: 40, wordmark: "1.55rem", tracking: "0.22em" },
} as const;
