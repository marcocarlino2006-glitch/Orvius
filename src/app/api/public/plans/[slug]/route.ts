import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, publicTokenLimited, sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { shopContact } from "@/lib/online-booking";
import { createPlanCheckout, publicPlansShop } from "@/lib/service-plans";

type Params = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Params) {
  const limited = await publicTokenLimited(request, "plans", "GET");
  if (limited) return limited;
  const { slug } = await params;
  const found = await publicPlansShop(slug);
  if (!found) return NextResponse.json({ error: "This business isn't selling plans online right now.", business: await shopContact(slug) }, { status: 404 });
  return NextResponse.json({
    business: { name: found.shop.name, phone: found.shop.vapiPhoneNumber ?? found.shop.twilioPhone ?? null },
    plans: found.plans,
  });
}

const JoinBody = z.object({
  planId: z.string().min(1).max(40),
  name: z.string().trim().min(2).max(120),
  phone: z.string().min(7).max(40),
  email: z.string().email().max(200).optional().or(z.literal("")),
  /** Hidden from people; bots fill it. */
  website: z.string().max(200).optional(),
});

export async function POST(request: Request, { params }: Params) {
  const limited = await publicTokenLimited(request, "plans", "POST");
  if (limited) return limited;
  const perIp = await sharedRateLimit({ key: `plans:ip:${clientIp(request)}`, limit: 5, windowMs: 60 * 60_000 });
  if (!perIp.ok) return tooManyRequests(perIp.retryAfterSec, "Too many tries from this connection. Call the business instead.");

  const parsed = JoinBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Add your name and a mobile number." }, { status: 400 });
  if (parsed.data.website) return NextResponse.json({ error: "Something went wrong. Call the business." }, { status: 400 });

  const result = await createPlanCheckout((await params).slug, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.reason === "unavailable" ? 404 : 400 });
  }
  return NextResponse.json({ url: result.url });
}
