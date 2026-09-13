import { auth } from "@/auth";
import { verifyAdminRequest } from "@/lib/env";
import { isFounderEmail } from "@/lib/founder";

/**
 * Whether a caller may read operational detail: the admin key, or being us.
 *
 * Two endpoints answer anonymous requests by design — /api/health so ops gates
 * can ask whether the line is up without a credential, and the checkout GET so
 * the pricing page can tell whether it may offer a subscribe button. Both were
 * also handing the diagnosis to anyone who asked: the shop and lead counts in
 * one, the names of the Stripe env vars still unset in the other.
 *
 * The key covers scripts. The session covers the browser, where /admin renders
 * those same numbers with a cookie and no bearer token, so a key-only test
 * would have blanked the one screen that exists to show them.
 *
 * Fails closed by way of isFounderEmail: with ORVIUS_FOUNDER_EMAILS unset and
 * no admin key presented, nobody is privileged.
 */
export async function isPrivilegedRequest(request: Request): Promise<boolean> {
  if (verifyAdminRequest(request)) return true;
  const session = await auth();
  return isFounderEmail(session?.user?.email);
}
