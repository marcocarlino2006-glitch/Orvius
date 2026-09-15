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
 * Logo lockups:
 * 1) Signal aperture alone (favicon / chrome)
 * 2) Aperture + a restrained lowercase wordmark. Archivo's broad counters and
 *    rounded shoulders give the name its own voice; tight optical spacing keeps
 *    it a mark rather than another piece of interface copy.
 */
export const logoSizes = {
  sm: { mark: 18, word: "1rem", tracking: "-0.055em" },
  md: { mark: 22, word: "1.075rem", tracking: "-0.055em" },
  lg: { mark: 25, word: "1.2rem", tracking: "-0.06em" },
  xl: { mark: 40, word: "2rem", tracking: "-0.065em" },
} as const;
