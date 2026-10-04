import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ACTIVE_SHOP_COOKIE, listShopAccess, summarizeShops } from "@/lib/workspace-access";

/** Open another shop this person owns or was added to. */
export async function POST(request: Request) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { businessId?: unknown };
  const access = await listShopAccess(email);
  const target = access.find((a) => a.business.id === body.businessId);
  if (!target) return NextResponse.json({ error: "You don't have access to that shop." }, { status: 403 });
  const response = NextResponse.json({ ok: true, shop: summarizeShops([target])[0] });
  response.cookies.set(ACTIVE_SHOP_COOKIE, target.business.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
