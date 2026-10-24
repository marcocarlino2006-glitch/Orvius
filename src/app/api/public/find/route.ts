import { NextResponse } from "next/server";
import { z } from "zod";
import { saveAreaRequest } from "@/lib/find-shop";
import { clientIp, sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";

const Body = z.object({
  trade: z.string().max(40),
  zip: z.string().max(12),
  name: z.string().max(80),
  phone: z.string().max(40),
  need: z.string().max(400),
  website: z.string().max(200).optional(),
});

/** A customer who searched and still needs a shop. The first live shop in that area can take it. */
export async function POST(request: Request) {
  const perIp = await sharedRateLimit({ key: `find:ip:${clientIp(request)}`, limit: 8, windowMs: 60 * 60_000, failClosed: true });
  if (!perIp.ok) return tooManyRequests(perIp.retryAfterSec, "Too many requests from this connection. Call a shop instead.");
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Add your name, a mobile number, and what you need done." }, { status: 400 });
  if (parsed.data.website) return NextResponse.json({ ok: true });
  const saved = await saveAreaRequest(parsed.data);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
