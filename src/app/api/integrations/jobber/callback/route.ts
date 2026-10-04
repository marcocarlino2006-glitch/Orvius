import { NextRequest, NextResponse } from "next/server";
import { personActor, recordAudit } from "@/lib/audit";
import { getAppUrl } from "@/lib/env";
import { JOBBER_OAUTH_COOKIE, connectJobber, openOAuthState } from "@/lib/jobber";
import { logWarn } from "@/lib/logger";
import { requirePermission } from "@/lib/tenant";

/** Jobber sends the owner back here with a code once they approve. */
export async function GET(request: NextRequest) {
  const authResult = await requirePermission("settings.edit", { entitled: false });
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;
  const settings = `${getAppUrl().replace(/\/$/, "")}/dashboard?settings=integrations`;
  const done = (outcome: string) => {
    const response = NextResponse.redirect(`${settings}&jobber=${outcome}`);
    response.cookies.delete({ name: JOBBER_OAUTH_COOKIE, path: "/api/integrations/jobber" });
    return response;
  };

  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  if (!code) return done("cancelled");
  const pending = openOAuthState(request.cookies.get(JOBBER_OAUTH_COOKIE)?.value, params.get("state"), business.id);
  if (!pending) return done("expired");

  try {
    const connection = await connectJobber({ businessId: business.id, code, verifier: pending.verifier });
    await recordAudit({
      businessId: business.id,
      entityType: "shop",
      entityId: business.id,
      action: "jobber.connected",
      ...personActor(authResult),
      summary: `${authResult.email} connected Jobber${connection.accountName ? ` (${connection.accountName})` : ""}. New calls now land in Jobber as requests.`,
    });
    return done("connected");
  } catch (error) {
    logWarn("jobber.connect_failed", { businessId: business.id, error: error instanceof Error ? error.message : String(error) });
    return done("failed");
  }
}
