export const TRADES = ["HVAC", "Plumbing", "Electrical"] as const;
export type Trade = (typeof TRADES)[number];
