/** Brand typography — one letterset everywhere (logo + product + marketing). */

export const brandWordmark = "Orvius";

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
 * 1) Integrated-OV monogram alone (favicon / chrome)
 * 2) Mark + Orvius set in Archivo bold (never a second letterset)
 */
export const logoSizes = {
  sm: { mark: 18, word: "0.9375rem", tracking: "-0.03em" },
  md: { mark: 22, word: "1.0625rem", tracking: "-0.032em" },
  lg: { mark: 24, word: "1.125rem", tracking: "-0.032em" },
  xl: { mark: 38, word: "2.15rem", tracking: "-0.04em" },
} as const;
