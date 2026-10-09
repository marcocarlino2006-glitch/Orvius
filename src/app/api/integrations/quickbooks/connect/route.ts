import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/env";
import { sealOAuthState } from "@/lib/jobber";
import { QUICKBOOKS_OAUTH_COOKIE, quickbooksAuthorizeUrl, quickbooksConfigured } from "@/lib/quickbooks";
import { isProduction } from "@/lib/runtime";
import { requirePermission } from "@/lib/tenant";

/** Send the owner to Intuit to approve Orvius for their QuickBooks company. */
export async function GET() {
  const authResult = await requirePermission("settings.edit", { entitled: false });
  if ("error" in authResult) return authResult.error;
  const settings = `${getAppUrl().replace(/\/$/, "")}/dashboard?settings=integrations`;
  if (!quickbooksConfigured()) return NextResponse.redirect(`${settings}&quickbooks=unavailable`);

  const { state, cookie } = sealOAuthState(authResult.business.id);
  const response = NextResponse.redirect(quickbooksAuthorizeUrl(state));
  response.cookies.set(QUICKBOOKS_OAUTH_COOKIE, cookie, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/api/integrations/quickbooks",
    maxAge: 10 * 60,
  });
  return response;
}
