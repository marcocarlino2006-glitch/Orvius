/**
 * Counsel-confirmed LLC formation state.
 *
 * Never invent a state in git. Confirmed 2026-09-23: New York.
 * Optional override on Vercel: ORVIUS_FORMATION_STATE=…
 */

/** Counsel-confirmed formation state — set only after founder/counsel names it. */
export const COUNSEL_FORMATION_STATE: string | null = "New York";

export function resolveFormationStateConfirmed(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string | null {
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

export function formationGoverningLawLabel(state: string | null): string {
  return state ?? "the State in which Solution Development LLC is organized";
}
