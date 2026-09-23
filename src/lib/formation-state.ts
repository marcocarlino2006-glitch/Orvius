/**
 * Counsel-confirmed LLC formation state.
 *
 * Never invent a state in git. After counsel confirms, set on Vercel + .env:
 *   ORVIUS_FORMATION_STATE=Delaware
 * (or the real state name counsel named — one word / short phrase).
 */

export function resolveFormationStateConfirmed(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string | null {
  const raw = String(env.ORVIUS_FORMATION_STATE ?? "").trim();
  if (!raw) return null;
  if (/YOUR_|changeme|placeholder|TODO|invent|example|unknown/i.test(raw)) {
    return null;
  }
  if (!/^[A-Za-z][A-Za-z .'-]{1,48}$/.test(raw)) return null;
  return raw;
}

export function formationGoverningLawLabel(state: string | null): string {
  return state ?? "the State in which Solution Development LLC is organized";
}
