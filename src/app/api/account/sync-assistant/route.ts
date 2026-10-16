import { NextResponse } from "next/server";
import { applyReceptionistSettings } from "@/lib/assistant-apply";
import { requirePermission } from "@/lib/tenant";

/**
 * Apply the shop's saved settings to its existing receptionist, again.
 * Settings only: it reads what is saved, sends it, and records the provider's
 * answer. It never buys, provisions, reattaches or repairs a phone line.
 */
export async function POST() {
  const authResult = await requirePermission("settings.edit", { entitled: false });
  if ("error" in authResult) return authResult.error;
  const { business, email, role } = authResult;
  const receptionistApply = await applyReceptionistSettings(business, { actor: role === "owner" ? "owner" : "teammate", email });
  return NextResponse.json({ ok: receptionistApply.state === "applied", receptionistApply });
}
