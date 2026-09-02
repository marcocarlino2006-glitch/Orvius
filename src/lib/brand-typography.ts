/** Brand typography — Cursor-tier: one voice, calm display. */

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

export const logoSizes = {
  sm: { mark: 20, wordmark: "0.9375rem", tracking: "-0.02em" },
  md: { mark: 22, wordmark: "1rem", tracking: "-0.025em" },
  lg: { mark: 26, wordmark: "1.125rem", tracking: "-0.03em" },
  xl: { mark: 30, wordmark: "1.25rem", tracking: "-0.03em" },
} as const;
