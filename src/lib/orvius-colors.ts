/**
 * Orvius Chromatics — source of truth for brand colorways.
 * CSS mirrors these values in `src/app/globals.css`.
 *
 * Signal is warm clay (Claude-inspired terracotta). Flare is emergency. Live is field status.
 */
export const orviusColors = {
  void: "#111110",
  panel: "#1A1A18",
  chalk: "#F8F8F6",
  fog: "#EEEEE9",
  ash: "#6B6A65",
  ashSoft: "#989792",
  rule: "#D4D4CE",
  signal: "#D97757",
  signalHot: "#E8956D",
  signalDim: "#C2613F",
  flare: "#E8461C",
  flareHot: "#FF5A2E",
  flareDim: "#B83312",
  live: "#2F6B4F",
  liveSoft: "#3F8A66",
  white: "#FFFFFF",
} as const;

export type OrviusColor = keyof typeof orviusColors;
