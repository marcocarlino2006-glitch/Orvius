import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPortfolio } from "@/lib/portfolio";

export async function GET(request: Request) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const days = Number(new URL(request.url).searchParams.get("days") ?? 7);
  return NextResponse.json(await getPortfolio(email, days), { headers: { "Cache-Control": "no-store" } });
}
