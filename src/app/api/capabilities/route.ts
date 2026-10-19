import { NextResponse } from "next/server";
import { loadCapabilities } from "@/lib/capabilities";
import { requireBusinessSession } from "@/lib/tenant";

/* What the shop asked for next to what is actually on, read from the same rules the call, text and payment paths use. */
export async function GET() {
  const session = await requireBusinessSession();
  if ("error" in session) return session.error;
  const capabilities = await loadCapabilities(session.business.id);
  if (!capabilities) return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  return NextResponse.json({ capabilities, checkedAt: new Date().toISOString() });
}
