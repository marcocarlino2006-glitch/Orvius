/** Brand typography — Oracle-weight Orbitron wordmark + locked circle mark. */

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
 * Circle stays in the lockup. Mark size is tuned to read equal to the wordmark
 * (Oracle / Grok presence — not a tiny decorative pip).
 */
export const logoSizes = {
  sm: { mark: 26, wordmark: "1rem", tracking: "0.18em" },
  md: { mark: 30, wordmark: "1.125rem", tracking: "0.2em" },
  lg: { mark: 36, wordmark: "1.35rem", tracking: "0.22em" },
  xl: { mark: 44, wordmark: "1.55rem", tracking: "0.24em" },
} as const;
