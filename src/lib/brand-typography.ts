/** Brand typography — Archivo speaks, Plex Mono reports, and the wordmark reports. */

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
 * Logo lockups:
 * 1) Signal aperture alone (favicon / chrome)
 * 2) Aperture + ORVIUS set in Plex Mono bold with open tracking — the wordmark
 *    belongs to the reporting voice, like every other machine label on the
 *    surface, so the lockup reads as instrumentation rather than as a logotype.
 */
export const logoSizes = {
  sm: { mark: 18, word: "0.8125rem", tracking: "0.16em" },
  md: { mark: 22, word: "0.875rem", tracking: "0.17em" },
  lg: { mark: 24, word: "0.9375rem", tracking: "0.18em" },
  xl: { mark: 38, word: "1.65rem", tracking: "0.16em" },
} as const;
