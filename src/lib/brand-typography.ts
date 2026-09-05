/** Brand typography — acquisition-grade company lockup. */

export const brandWordmark = "Orvius";

export const typeScale = {
  caption: "0.75rem",
  small: "0.875rem",
  body: "1rem",
  lead: "1.125rem",
  title: "1.25rem",
  headline: "clamp(1.875rem, 3.4vw, 2.75rem)",
  display: "clamp(2.75rem, 5.2vw, 4rem)",
} as const;

/**
 * 1) Signal ring alone
 * 2) [◎]RVIUS — proprietary O + institutional type
 * Tracking: confident, not sparse (buyer-deck energy).
 */
export const logoSizes = {
  sm: { mark: 20, wordmark: "1.1rem", tracking: "0.11em" },
  md: { mark: 24, wordmark: "1.28rem", tracking: "0.12em" },
  lg: { mark: 28, wordmark: "1.48rem", tracking: "0.125em" },
  xl: { mark: 56, wordmark: "3.15rem", tracking: "0.1em" },
} as const;
