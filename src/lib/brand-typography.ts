/** Brand typography — Oracle-weight sci-fi wordmark + X-style O mark. */

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

/** Bigger, bolder — brand must read at a glance like X / Oracle. */
export const logoSizes = {
  sm: { mark: 22, wordmark: "1rem", tracking: "0.18em" },
  md: { mark: 26, wordmark: "1.125rem", tracking: "0.2em" },
  lg: { mark: 32, wordmark: "1.35rem", tracking: "0.22em" },
  xl: { mark: 38, wordmark: "1.5rem", tracking: "0.24em" },
} as const;
