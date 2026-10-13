import { NextResponse } from "next/server";

import { publicTokenLimited } from "@/lib/rate-limit";
import { setWeeklyEmail, verifyWeeklyEmailToken } from "@/lib/weekly-email-optout";

/**
 * Mail providers POST "List-Unsubscribe=One-Click" here with no session (RFC 8058);
 * the unsubscribe page sends { on } to stop or restart the Monday email.
 */
export async function POST(request: Request) {
  const limited = await publicTokenLimited(request, "unsubscribe", "POST");
  if (limited) return limited;
  const businessId = verifyWeeklyEmailToken(new URL(request.url).searchParams.get("t"));
  if (!businessId) return NextResponse.json({ error: "This link isn't valid. Open it from the email again." }, { status: 400 });

  let on = false;
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { on?: unknown } | null;
    on = body?.on === true;
  }
  if (!(await setWeeklyEmail(businessId, on))) return NextResponse.json({ error: "That shop no longer exists." }, { status: 404 });
  return NextResponse.json({ ok: true, on });
}
