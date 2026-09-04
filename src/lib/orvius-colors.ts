/**
 * Orvius Chromatics — shop command system.
 * Cool paper · graphite ink · copper signal (trades metal, not Cursor orange).
 */
export const orviusColors = {
  canvas: "#F1F3F6",
  surface: "#E8ECF1",
  surfaceAlt: "#DDE3EA",
  void: "#0C1016",
  voidDeep: "#070A0E",
  panel: "#12171F",
  mist: "#DDE3EA",
  chalk: "#F1F3F6",
  fog: "#E8ECF1",
  ash: "#5C6570",
  ashSoft: "#7A8490",
  rule: "#D5DBE3",
  hairline: "#D5DBE3",
  signal: "#C4783A",
  signalHot: "#D4894A",
  signalDim: "#A8642E",
  flare: "#CF2D56",
  flareHot: "#E03D66",
  flareDim: "#B82548",
  live: "#1A9B6E",
  liveSoft: "#22B07E",
  white: "#FFFFFF",
} as const;

export type OrviusColor = keyof typeof orviusColors;
