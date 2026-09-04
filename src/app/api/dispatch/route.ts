import { NextResponse } from "next/server";
import { getDispatchBoard } from "@/lib/field";
import { requirePlanModule } from "@/lib/plan-gate";
import { requireEntitledSession } from "@/lib/tenant";

export async function GET(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "dispatch");
  if ("error" in planGate) return planGate.error;

  const url = new URL(request.url);
  const day = url.searchParams.get("day");

  const board = await getDispatchBoard(business.id, day);
  return NextResponse.json({
    business: { id: business.id, name: business.name },
    ...board,
  });
}
