/**
 * Mirror of src/lib/formation-state.ts for plain .mjs gates.
 * Keep rules identical — never invent a formation state.
 */
export function resolveFormationStateConfirmed(env = process.env) {
  const raw = String(env.ORVIUS_FORMATION_STATE ?? "").trim();
  if (!raw) return null;
  if (/YOUR_|changeme|placeholder|TODO|invent|example|unknown/i.test(raw)) {
    return null;
  }
  if (!/^[A-Za-z][A-Za-z .'-]{1,48}$/.test(raw)) return null;
  return raw;
}
