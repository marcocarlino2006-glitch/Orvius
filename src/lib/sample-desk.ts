/**
 * The sample desk is what a visitor sees until they sign up.
 * After sign-in, their own shop is the only one these pages and reads serve.
 * Edge-safe: middleware imports this, so it stays free of Prisma.
 */

const DESK_ROOTS = [
  "/dashboard/schedule",
  "/dashboard/inbox",
  "/dashboard/calls",
  "/dashboard/customers",
  "/dashboard/jobs",
  "/dashboard/work",
  "/dashboard/dispatch",
] as const;

/** Pages a signed-out visitor can open. Setup, settings, money, and Ask stay behind sign-in. */
export function isSampleDeskPage(pathname: string): boolean {
  if (pathname === "/dashboard/jobs/new" || pathname.startsWith("/dashboard/jobs/new/")) return false;
  if (pathname === "/dashboard") return true;
  return DESK_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

const EXACT_READS = new Set([
  "/api/ring1",
  "/api/work",
  "/api/calls",
  "/api/customers",
  "/api/jobs",
  "/api/leads",
  "/api/dispatch",
  "/api/technicians",
  "/api/messages",
]);

const NESTED_READS = [
  /^\/api\/calls\/[^/]+$/,
  /^\/api\/customers\/(?!win-back$)[^/]+$/,
  /^\/api\/customers\/(?!win-back$)[^/]+\/visits$/,
  /^\/api\/jobs\/(?!options$)[^/]+$/,
  /^\/api\/jobs\/(?!options$)[^/]+\/field$/,
  /^\/api\/leads\/[^/]+$/,
  /^\/api\/messages\/thread$/,
];

/** GET paths that may answer with the sample shop. Billing, export, and account stay closed. */
export function isSampleDeskRead(pathname: string): boolean {
  const path = pathname.split("?")[0]?.replace(/\/$/, "") || "/";
  if (EXACT_READS.has(path)) return true;
  return NESTED_READS.some((pattern) => pattern.test(path));
}
