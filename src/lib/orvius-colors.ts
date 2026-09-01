/**
 * Orvius Chromatics — white canvas, black ink.
 * CSS mirrors these values in `src/app/globals.css`.
 */
export const orviusColors = {
  void: "#0A0A0A",
  voidDeep: "#1A1A1A",
  panel: "#262626",
  mist: "#F5F5F5",
  chalk: "#FFFFFF",
  fog: "#FAFAFA",
  ash: "#737373",
  ashSoft: "#A3A3A3",
  rule: "#E5E5E5",
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
