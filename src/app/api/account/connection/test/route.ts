import { NextRequest, NextResponse } from "next/server";
import { checkForwardTest, startForwardTest } from "@/lib/forward-test";
import type { Coverage } from "@/lib/number-connection";
import { getShopLine } from "@/lib/owner-setup-state";
import { isSetupSandbox } from "@/lib/setup-flow";
import { requireEntitledSession } from "@/lib/tenant";

export async function POST() {
  const auth = await requireEntitledSession();
  if ("error" in auth) return auth.error;
  const b = auth.business;
  if (isSetupSandbox(b)) {
    return NextResponse.json(
      { error: "Test mode doesn't place real calls. Go live first, then test your number." },
      { status: 409 },
    );
  }
  const coverage = (b.forwardCoverage ?? (b.captureMode === "publish" ? "main" : "missed")) as Coverage;
  const target = coverage === "main" ? getShopLine(b) : b.phone;
  if (coverage === "main") {
    return NextResponse.json(
      { error: `Call ${target ?? "your Orvius number"} from any phone. When Orvius answers, it's working.` },
      { status: 409 },
    );
  }
  const result = await startForwardTest({ business: b, businessNumber: b.phone ?? "", coverage });
  if (!result.ok) return NextResponse.json({ error: result.message, reason: result.reason }, { status: 409 });
  return NextResponse.json({ id: result.id });
}

export async function GET(request: NextRequest) {
  const auth = await requireEntitledSession();
  if ("error" in auth) return auth.error;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing test." }, { status: 400 });
  const test = await checkForwardTest({ businessId: auth.business.id, id, line: getShopLine(auth.business) });
  if (!test) return NextResponse.json({ error: "That test isn't on this account." }, { status: 404 });
  return NextResponse.json(test);
}
