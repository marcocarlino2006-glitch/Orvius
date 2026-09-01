/**
 * Orvius Chromatics — Cursor-tier warm editorial system.
 * Cream canvas · warm ink · orange accent used sparingly.
 */
export const orviusColors = {
  canvas: "#F7F7F4",
  surface: "#F2F1ED",
  surfaceAlt: "#EBEAE5",
  void: "#26251E",
  voidDeep: "#1E1D18",
  panel: "#26251E",
  mist: "#EBEAE5",
  chalk: "#F7F7F4",
  fog: "#EBEAE5",
  ash: "#6B6A64",
  ashSoft: "#8A8983",
  rule: "#E6E5E0",
  hairline: "#E6E5E0",
  signal: "#F54E00",
  signalHot: "#FF5C0D",
  signalDim: "#E04600",
  flare: "#CF2D56",
  flareHot: "#E03D66",
  flareDim: "#B82548",
  live: "#1F9D68",
  liveSoft: "#2EB578",
  white: "#FFFFFF",
} as const;

export type OrviusColor = keyof typeof orviusColors;
