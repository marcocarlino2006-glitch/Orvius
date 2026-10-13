import { NextResponse } from "next/server";
import { z } from "zod";

import { confirmEmailChange } from "@/lib/email-change";
import { clientIp, sharedRateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({ token: z.string().min(1).max(512) });

/** Opened from the new inbox, often on a phone with no session, so the token alone is the proof. */
export async function POST(request: Request) {
  const limit = await sharedRateLimit({ key: `email-change:${clientIp(request)}`, limit: 10, windowMs: 15 * 60 * 1000 });
  if (!limit.ok) return NextResponse.json({ error: "Too many tries. Wait 15 minutes and try again." }, { status: 429 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That link is missing its code. Open it from the email again." }, { status: 400 });
  const result = await confirmEmailChange(parsed.data.token);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, email: result.toEmail });
}
