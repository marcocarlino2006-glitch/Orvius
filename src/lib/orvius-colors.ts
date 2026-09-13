/**
 * Orvius Chromatics — shop command system.
 * Warm paper · charcoal ink · copper signal (trades metal, not Cursor orange).
 */
export const orviusColors = {
  canvas: "#F5F3EE",
  surface: "#EEECE6",
  surfaceAlt: "#E4E1D9",
  void: "#22262B",
  voidDeep: "#1B1F23",
  panel: "#2B3037",
  mist: "#E4E1D9",
  chalk: "#F5F3EE",
  fog: "#EEECE6",
  ash: "#5F615B",
  ashSoft: "#7B7D76",
  rule: "#DCDAD2",
  hairline: "#DCDAD2",
  signal: "#B8562C",
  signalHot: "#CC6737",
  signalDim: "#8A3D1C",
  flare: "#CF2D56",
  flareHot: "#E03D66",
  flareDim: "#B82548",
  live: "#1A9B6E",
  liveSoft: "#22B07E",
  white: "#FFFFFF",
} as const;

export type OrviusColor = keyof typeof orviusColors;
