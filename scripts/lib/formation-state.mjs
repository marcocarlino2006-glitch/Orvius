/**
 * Mirror of src/lib/formation-state.ts for plain .mjs gates.
 * Keep rules identical — never invent a formation state.
 * Counsel-confirmed 2026-09-23: New York.
 */
export const COUNSEL_FORMATION_STATE = "New York";

export function resolveFormationStateConfirmed(env = process.env) {
  const raw = String(env.ORVIUS_FORMATION_STATE ?? "").trim();
  if (raw) {
    if (/YOUR_|changeme|placeholder|TODO|invent|example|unknown/i.test(raw)) {
      return null;
    }
    if (!/^[A-Za-z][A-Za-z .'-]{1,48}$/.test(raw)) return null;
    return raw;
  }
  return COUNSEL_FORMATION_STATE;
}
