import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pendingGalleryCalls, reviewGalleryCall } from "@/lib/call-gallery";
import { verifyAdminRequest } from "@/lib/env";
import { isFounderEmail } from "@/lib/founder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function allowed(request: Request) {
  if (verifyAdminRequest(request)) return true;
  const session = await auth();
  return isFounderEmail(session?.user?.email?.toLowerCase());
}

/** Calls shops sent to the gallery, waiting for a person at Orvius to read them. */
export async function GET(request: Request) {
  if (!(await allowed(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await pendingGalleryCalls();
  return NextResponse.json({
    pending: rows.map((r) => ({ id: r.id, shopName: r.shopName, trade: r.trade, turns: JSON.parse(r.turnsJson), sharedByEmail: r.sharedByEmail, createdAt: r.createdAt })),
  });
}

export async function POST(request: Request) {
  if (!(await allowed(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { id?: string; decision?: string };
  if (!body.id || (body.decision !== "listed" && body.decision !== "removed")) {
    return NextResponse.json({ error: "Say which call and whether to list or remove it." }, { status: 400 });
  }
  const changed = await reviewGalleryCall(body.id, body.decision);
  return NextResponse.json({ ok: changed });
}
