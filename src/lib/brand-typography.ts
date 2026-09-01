/** Brand typography — single source for logo and type scale references. */

export const brandWordmark = "ORVIUS";

export const typeScale = {
  caption: "0.6875rem",
  small: "0.8125rem",
  body: "1rem",
  lead: "1.0625rem",
  title: "1.125rem",
  headline: "clamp(1.75rem, 3.2vw, 2.5rem)",
  display: "clamp(2.25rem, 4.5vw, 3.375rem)",
} as const;

export const logoSizes = {
  sm: { mark: 20, wordmark: "0.6875rem", tracking: "0.2em" },
  md: { mark: 24, wordmark: "0.8125rem", tracking: "0.22em" },
  lg: { mark: 28, wordmark: "0.9375rem", tracking: "0.24em" },
  xl: { mark: 32, wordmark: "1.0625rem", tracking: "0.26em" },
} as const;
