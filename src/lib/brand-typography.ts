/** Brand typography — proprietary letterset is the company name. */

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
 * 1) Signal O alone (favicon)
 * 2) Full proprietary ORVIUS letterset (the name is the logo)
 */
export const logoSizes = {
  sm: { mark: 22, wordmark: "1.1rem", tracking: "0.12em" },
  md: { mark: 26, wordmark: "1.3rem", tracking: "0.12em" },
  lg: { mark: 30, wordmark: "1.5rem", tracking: "0.12em" },
  xl: { mark: 56, wordmark: "3.2rem", tracking: "0.1em" },
} as const;
