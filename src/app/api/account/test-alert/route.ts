import { NextResponse } from "next/server";
import { notifyOwner } from "@/lib/notifications";
import {
  getShopLines,
  validateOwnerPhoneForAlerts,
} from "@/lib/owner-alerts";
import { sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { requireEntitledSession } from "@/lib/tenant";

export async function POST() {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;

  const business = authResult.business;
  const limited = await sharedRateLimit({ key: `test-alert:${business.id}`, limit: 5, windowMs: 10 * 60_000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec, "That's a lot of test alerts. Wait a few minutes and try again.");
  const phoneCheck = validateOwnerPhoneForAlerts({
    ownerPhone: business.ownerPhone,
    shopLines: getShopLines(business),
  });

  if (!business.ownerPhone && !business.ownerEmail) {
    return NextResponse.json(
      { error: "Add owner mobile or email in Settings first" },
      { status: 400 },
    );
  }

  if (business.ownerPhone && !phoneCheck.ok) {
    return NextResponse.json({ error: phoneCheck.reason }, { status: 400 });
  }

  const result = await notifyOwner({
    businessId: business.id,
    ownerPhone: business.ownerPhone,
    ownerEmail: business.ownerEmail,
    businessName: business.name,
    message:
      "Test alert from Orvius. If you received this, owner notifications are working.",
    dedupeKey: `test-alert:${business.id}:${Math.floor(Date.now() / 60_000)}`,
  });

  const delivered =
    result.sms?.status === "sent" || result.email?.status === "sent";

  return NextResponse.json({
    ok: delivered,
    sms: result.sms,
    email: result.email,
  });
}
