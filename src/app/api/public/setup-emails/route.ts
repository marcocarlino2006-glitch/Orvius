import { NextResponse } from "next/server";
import { stopLifecycleEmails, verifyLifecycleEmailToken } from "@/lib/lifecycle-email";
import { publicTokenLimited } from "@/lib/rate-limit";

/**
 * Mail providers POST "List-Unsubscribe=One-Click" here with no session
 * (RFC 8058); the page's button posts the same form and comes back to it.
 * Stops the setup, welcome and first-call emails for that shop.
 */
export async function POST(request: Request) {
  const limited = await publicTokenLimited(request, "setup-emails", "POST");
  if (limited) return limited;
  const url = new URL(request.url);
  const token = url.searchParams.get("t");
  const businessId = verifyLifecycleEmailToken(token);
  if (!businessId) return NextResponse.json({ error: "This link isn't valid. Open it from the email again." }, { status: 400 });
  if (!(await stopLifecycleEmails(businessId))) return NextResponse.json({ error: "That shop no longer exists." }, { status: 404 });
  const form = (request.headers.get("content-type") ?? "").includes("form")
    ? await request.formData().catch(() => null)
    : null;
  if (form?.get("from") === "page") {
    return NextResponse.redirect(new URL(`/unsubscribe/setup?t=${encodeURIComponent(token!)}&stopped=1`, url.origin), 303);
  }
  return NextResponse.json({ ok: true });
}
