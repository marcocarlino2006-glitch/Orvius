import { NextResponse } from "next/server";
import { getDispatchBoard } from "@/lib/field";
import { requireBusinessSession } from "@/lib/tenant";

export async function GET(request: Request) {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const url = new URL(request.url);
  const day = url.searchParams.get("day");

  const board = await getDispatchBoard(business.id, day);
  return NextResponse.json({
    business: { id: business.id, name: business.name },
    ...board,
  });
}
