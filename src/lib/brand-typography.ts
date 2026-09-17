/** Brand typography — Archivo speaks, Plex Mono reports. */

export const brandWordmark = "orvius";

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
 * Brand lockups (Stripe way until a mark earns its place):
 * 1) Word alone — every product + marketing surface
 * 2) Signal bridge alone — favicon / OS chrome only
 *
 * Sizes are tuned for the word carrying the whole identity (no mark beside it).
 */
export const logoSizes = {
  sm: { mark: 22, word: "1.35rem", tracking: "-0.07em" },
  md: { mark: 28, word: "1.65rem", tracking: "-0.075em" },
  lg: { mark: 34, word: "1.9rem", tracking: "-0.08em" },
  xl: { mark: 52, word: "3rem", tracking: "-0.085em" },
} as const;
