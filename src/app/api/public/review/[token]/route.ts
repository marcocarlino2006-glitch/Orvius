import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { leaveVisitReview, visitReviewView } from "@/lib/visit-review";

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const view = await visitReviewView(token);
  if (!view.ok) return NextResponse.json({ error: view.error }, { status: view.status });
  return NextResponse.json(view);
}

const Body = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().max(400).optional(),
  website: z.string().max(200).optional(),
});

export async function POST(request: Request, { params }: Params) {
  const perIp = await sharedRateLimit({ key: `review:ip:${clientIp(request)}`, limit: 10, windowMs: 60 * 60_000, failClosed: true });
  if (!perIp.ok) return tooManyRequests(perIp.retryAfterSec, "Too many reviews from this connection.");
  const { token } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a rating from 1 to 5." }, { status: 400 });
  if (parsed.data.website) return NextResponse.json({ ok: true });
  const saved = await leaveVisitReview({ token, rating: parsed.data.rating, body: parsed.data.body });
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
  return NextResponse.json({ ok: true });
}
