/** Brand typography — one letterset everywhere (logo + product + marketing). */

export const brandWordmark = "ORVIUS";

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
 * Brand lockup: signal O + ORVIUS.
 * Wordmark uses the display face (Space Grotesk); product UI uses IBM Plex Sans.
 */
export const logoSizes = {
  sm: { mark: 18, word: "0.9375rem", tracking: "0.08em" },
  md: { mark: 22, word: "1.0625rem", tracking: "0.08em" },
  lg: { mark: 26, word: "1.2rem", tracking: "0.085em" },
  xl: { mark: 48, word: "2.85rem", tracking: "0.14em" },
} as const;
