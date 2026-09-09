/**
 * Orvius Chromatics — shop command system.
 * Warm paper · charcoal ink · copper signal (trades metal, not Cursor orange).
 */
export const orviusColors = {
  canvas: "#F6F5F1",
  surface: "#EFEEE9",
  surfaceAlt: "#E5E3DC",
  void: "#25292E",
  voidDeep: "#1F2327",
  panel: "#2C3137",
  mist: "#E5E3DC",
  chalk: "#F6F5F1",
  fog: "#EFEEE9",
  ash: "#62645F",
  ashSoft: "#7D7F79",
  rule: "#D9D8D1",
  hairline: "#D9D8D1",
  signal: "#BD643C",
  signalHot: "#CF7750",
  signalDim: "#8F4528",
  flare: "#CF2D56",
  flareHot: "#E03D66",
  flareDim: "#B82548",
  live: "#1A9B6E",
  liveSoft: "#22B07E",
  white: "#FFFFFF",
} as const;

export type OrviusColor = keyof typeof orviusColors;
