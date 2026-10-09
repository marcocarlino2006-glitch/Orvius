import { NextRequest, NextResponse } from "next/server";
import { afterResponse } from "@/lib/after-response";
import { personActor, recordAudit } from "@/lib/audit";
import { getAppUrl } from "@/lib/env";
import { openOAuthState } from "@/lib/jobber";
import { logWarn } from "@/lib/logger";
import { QUICKBOOKS_OAUTH_COOKIE, connectQuickBooks, drainQuickBooksSyncs } from "@/lib/quickbooks";
import { requirePermission } from "@/lib/tenant";

/** Intuit sends the owner back here with a code and the company (realm) they picked. */
export async function GET(request: NextRequest) {
  const authResult = await requirePermission("settings.edit", { entitled: false });
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;
  const settings = `${getAppUrl().replace(/\/$/, "")}/dashboard?settings=integrations`;
  const done = (outcome: string) => {
    const response = NextResponse.redirect(`${settings}&quickbooks=${outcome}`);
    response.cookies.delete({ name: QUICKBOOKS_OAUTH_COOKIE, path: "/api/integrations/quickbooks" });
    return response;
  };

  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const realmId = params.get("realmId");
  if (!code || !realmId) return done("cancelled");
  if (!openOAuthState(request.cookies.get(QUICKBOOKS_OAUTH_COOKIE)?.value, params.get("state"), business.id)) return done("expired");

  try {
    const connection = await connectQuickBooks({ businessId: business.id, code, realmId });
    await recordAudit({
      businessId: business.id,
      entityType: "shop",
      entityId: business.id,
      action: "quickbooks.connected",
      ...personActor(authResult),
      summary: `${authResult.email} connected QuickBooks${connection.companyName ? ` (${connection.companyName})` : ""}. Payments collected from now on go there as sales receipts.`,
    });
    await afterResponse(() => drainQuickBooksSyncs({ businessId: business.id, limit: 10, budgetMs: 20_000 }));
    return done("connected");
  } catch (error) {
    logWarn("quickbooks.connect_failed", { businessId: business.id, error: error instanceof Error ? error.message : String(error) });
    return done("failed");
  }
}
