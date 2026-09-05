/** Brand typography — cut geometric wordmark (Oracle / Tesla lineage). */

export const brandWordmark = "Orvius";

/**
 * Craft scale — brand face = cut lockups only; UI sans does headlines/body.
 */
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
 * Two logo lines:
 * 1) Cut O mark
 * 2) Cut ORVIUS wordmark (letters sliced)
 */
export const logoSizes = {
  sm: { mark: 18, wordmark: "0.95rem", tracking: "0.22em" },
  md: { mark: 22, wordmark: "1.15rem", tracking: "0.24em" },
  lg: { mark: 28, wordmark: "1.4rem", tracking: "0.26em" },
  xl: { mark: 48, wordmark: "2.6rem", tracking: "0.2em" },
} as const;
