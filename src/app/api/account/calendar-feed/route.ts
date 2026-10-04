import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { resetCalendarFeed } from "@/lib/calendar-feed";
import { requirePermission } from "@/lib/tenant";

/** New feed link; every calendar still subscribed to the old one stops updating. */
export async function POST() {
  const authResult = await requirePermission("settings.edit", { entitled: false });
  if ("error" in authResult) return authResult.error;
  const { business, email, role } = authResult;

  const calendarFeedUrl = await resetCalendarFeed(business.id);
  if (!calendarFeedUrl) {
    return NextResponse.json({ error: "Calendar links are not available right now." }, { status: 503 });
  }
  await recordAudit({
    businessId: business.id,
    entityType: "shop",
    entityId: business.id,
    action: "calendar_feed.reset",
    actor: role === "owner" ? "owner" : "teammate",
    actorEmail: email,
    summary: `${email} reset the calendar feed link. The old link stopped working.`,
  });
  return NextResponse.json({ calendarFeedUrl });
}
