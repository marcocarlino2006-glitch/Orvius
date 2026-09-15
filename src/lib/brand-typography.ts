/** Brand typography — Archivo speaks, Plex Mono reports. */

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
 * 1) Signal-route monogram alone (favicon / chrome)
 * 2) Insignia + engineered display lettering drawn for Orvius.
 */
export const logoSizes = {
  sm: { mark: 22, word: "1.2rem", tracking: "-0.065em" },
  md: { mark: 28, word: "1.5rem", tracking: "-0.07em" },
  lg: { mark: 34, word: "1.75rem", tracking: "-0.075em" },
  xl: { mark: 52, word: "2.75rem", tracking: "-0.08em" },
} as const;
