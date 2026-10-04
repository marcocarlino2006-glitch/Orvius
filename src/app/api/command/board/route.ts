import { NextResponse } from "next/server";
import { buildCommandBoard } from "@/lib/command-board";
import { requireEntitledSession } from "@/lib/tenant";

export async function GET() {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  return NextResponse.json(await buildCommandBoard(authResult.business.id));
}
