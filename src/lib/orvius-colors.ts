/**
 * Orvius Chromatics — source of truth for brand colorways.
 * CSS mirrors these values in `src/app/globals.css`.
 */
export const orviusColors = {
  void: "#0A0B0A",
  panel: "#141614",
  chalk: "#F2F1EC",
  fog: "#E6E5DF",
  ash: "#6F6E67",
  ashSoft: "#9B9A90",
  rule: "#CCCAC2",
  flare: "#E8461C",
  flareHot: "#FF5A2E",
  flareDim: "#B83312",
  live: "#2F6B4F",
  liveSoft: "#3F8A66",
  white: "#FFFFFF",
} as const;

export type OrviusColor = keyof typeof orviusColors;
