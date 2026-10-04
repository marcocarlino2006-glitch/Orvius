import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/env";
import { JOBBER_OAUTH_COOKIE, jobberAuthorizeUrl, jobberConfigured, sealOAuthState } from "@/lib/jobber";
import { isProduction } from "@/lib/runtime";
import { requirePermission } from "@/lib/tenant";

/** Send the owner to Jobber to approve Orvius. */
export async function GET() {
  const authResult = await requirePermission("settings.edit", { entitled: false });
  if ("error" in authResult) return authResult.error;
  const settings = `${getAppUrl().replace(/\/$/, "")}/dashboard?settings=integrations`;
  if (!jobberConfigured()) return NextResponse.redirect(`${settings}&jobber=unavailable`);

  const { state, challenge, cookie } = sealOAuthState(authResult.business.id);
  const response = NextResponse.redirect(jobberAuthorizeUrl({ state, codeChallenge: challenge }));
  response.cookies.set(JOBBER_OAUTH_COOKIE, cookie, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/api/integrations/jobber",
    maxAge: 10 * 60,
  });
  return response;
}
