/** Brand typography — condensed industrial wordmark + twin-orbit O. */

export const brandWordmark = "Orvius";

export const typeScale = {
  caption: "0.8125rem",
  small: "0.875rem",
  body: "0.9375rem",
  lead: "1.0625rem",
  title: "1.125rem",
  headline: "clamp(1.75rem, 3.2vw, 2.5rem)",
  display: "clamp(2.35rem, 4.2vw, 3.25rem)",
} as const;

/**
 * Two logo lines:
 * 1) Mark alone — dual-rail O
 * 2) Integrated — mark replaces O → [O]RVIUS
 */
export const logoSizes = {
  sm: { mark: 22, wordmark: "1.05rem", tracking: "0.08em" },
  md: { mark: 28, wordmark: "1.25rem", tracking: "0.09em" },
  lg: { mark: 36, wordmark: "1.55rem", tracking: "0.1em" },
  xl: { mark: 52, wordmark: "2.35rem", tracking: "0.11em" },
} as const;
