import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { activationTerms, draftActivationBusiness } from "@/lib/activation-ack";
import { findBusinessForOwner } from "@/lib/provision-business";
import { isSetupSandbox } from "@/lib/setup-flow";

/** The notice callers will hear and the versions to approve, for the shop this setup will turn on. */
export async function GET(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const name = (request.nextUrl.searchParams.get("name") ?? "").trim().slice(0, 120);
  if (name.length < 2) return NextResponse.json({ error: "Shop name must be at least 2 characters" }, { status: 400 });
  const existing = await findBusinessForOwner(email);
  const shop = existing && isSetupSandbox(existing) ? { ...existing, name } : draftActivationBusiness(name);
  const { notice, noticeVersion, setupVersion } = activationTerms(shop);
  return NextResponse.json({ notice, noticeVersion, setupVersion });
}
