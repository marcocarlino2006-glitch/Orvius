import { NextResponse } from "next/server";
import { z } from "zod";
import { AreaClaimError, areaCopy, claimAreaRequest, shopArea } from "@/lib/find-shop";
import { requireEntitledSession } from "@/lib/tenant";

/** What customers in this shop's trade and ZIP can already find, and who is still waiting. */
export async function GET() {
  const auth = await requireEntitledSession();
  if ("error" in auth) return auth.error;
  const area = await shopArea(auth.business.id);
  return NextResponse.json({ area, lines: areaCopy(area) });
}

const Body = z.object({ requestId: z.string().min(8).max(40) });

export async function POST(request: Request) {
  const auth = await requireEntitledSession();
  if ("error" in auth) return auth.error;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That request isn't on the list." }, { status: 400 });
  try {
    const taken = await claimAreaRequest({ businessId: auth.business.id, requestId: parsed.data.requestId });
    return NextResponse.json({ ok: true, leadId: taken.leadId });
  } catch (error) {
    if (error instanceof AreaClaimError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
