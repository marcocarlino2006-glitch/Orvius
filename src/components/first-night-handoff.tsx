export const FIRST_NIGHT_PARAM = "live";
export const FIRST_NIGHT_STORAGE_KEY = "orvius-first-night-pending";

/** Call before leaving onboarding so Command shows the handoff once. */
export function markFirstNightPending() {
  try {
    sessionStorage.setItem(FIRST_NIGHT_STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}
