/**
 * Orvius Chromatics — source of truth for brand colorways.
 * CSS mirrors these values in `src/app/globals.css`.
 */
export const orviusColors = {
  void: "#1A1917",
  voidDeep: "#323230",
  panel: "#3F3F3C",
  mist: "#ECEAE6",
  chalk: "#F9F9F7",
  fog: "#F2F1ED",
  ash: "#6F6E69",
  ashSoft: "#94938D",
  rule: "#E5E4DF",
  signal: "#F0704A",
  signalHot: "#F58868",
  signalDim: "#E05A32",
  flare: "#EF4444",
  flareHot: "#F87171",
  flareDim: "#DC2626",
  live: "#1F9D68",
  liveSoft: "#2EB578",
  white: "#FFFFFF",
} as const;

export type OrviusColor = keyof typeof orviusColors;
