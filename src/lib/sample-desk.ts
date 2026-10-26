/**
 * Before sign-up, only the home desk is open, and it draws a sample in the browser.
 * A shop's number, customers, jobs, and calls are that shop's. They are never a public read.
 * Edge-safe: middleware imports this, so it stays free of Prisma.
 */

/** The one page a signed-out visitor can open. Every other desk page belongs to a signed-in shop. */
export function isSampleDeskPage(pathname: string): boolean {
  return pathname === "/dashboard";
}

/**
 * Shop reads stay signed in.
 * Kept so a future change cannot quietly mark a customer, job, or call route public.
 */
export function isSampleDeskRead(_pathname: string): boolean {
  return false;
}
