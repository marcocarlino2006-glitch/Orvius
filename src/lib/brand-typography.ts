/** Brand typography — sci-fi command voice. Orbitron mark + Space Grotesk UI. */

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
  sm: { mark: 20, wordmark: "0.875rem", tracking: "0.12em" },
  md: { mark: 22, wordmark: "0.9375rem", tracking: "0.14em" },
  lg: { mark: 28, wordmark: "1.0625rem", tracking: "0.16em" },
  xl: { mark: 32, wordmark: "1.1875rem", tracking: "0.18em" },
} as const;
