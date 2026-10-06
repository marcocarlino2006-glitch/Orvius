import { NextResponse } from "next/server";
import { z } from "zod";
import { bookableShop, bookingServices, bookingSlots, bookOnline } from "@/lib/online-booking";
import { clientIp, publicTokenLimited, sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";

type Params = { params: Promise<{ slug: string }> };

const notFound = () => NextResponse.json({ error: "Online booking isn't available for this business." }, { status: 404 });

export async function GET(request: Request, { params }: Params) {
  const limited = await publicTokenLimited(request, "book", "GET");
  if (limited) return limited;
  const shop = await bookableShop((await params).slug);
  if (!shop) return notFound();

  const services = bookingServices(shop);
  const requested = new URL(request.url).searchParams.get("service");
  const service = requested && services.includes(requested) ? requested : null;
  return NextResponse.json({
    business: { name: shop.name, timezone: shop.timezone, phone: shop.vapiPhoneNumber ?? shop.twilioPhone ?? null },
    services,
    service,
    slots: service ? await bookingSlots(shop, service) : [],
  });
}

const BookBody = z.object({
  serviceType: z.string().min(1).max(120),
  at: z.string().min(10).max(40),
  name: z.string().trim().min(2).max(120),
  phone: z.string().min(7).max(40),
  email: z.string().email().max(200).optional().or(z.literal("")),
  address: z.string().max(300).optional(),
  notes: z.string().max(1000).optional(),
  marketingOptIn: z.boolean().optional(),
  /** Hidden from people; bots fill it. */
  website: z.string().max(200).optional(),
});

export async function POST(request: Request, { params }: Params) {
  const limited = await publicTokenLimited(request, "book", "POST");
  if (limited) return limited;
  const perIp = await sharedRateLimit({ key: `book:ip:${clientIp(request)}`, limit: 5, windowMs: 60 * 60_000 });
  if (!perIp.ok) return tooManyRequests(perIp.retryAfterSec, "Too many bookings from this connection. Call the business instead.");

  const shop = await bookableShop((await params).slug);
  if (!shop) return notFound();

  const parsed = BookBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Add your name and a mobile number, then pick a time." }, { status: 400 });
  }
  if (parsed.data.website) {
    return NextResponse.json({ error: "Something went wrong. Call the business to book." }, { status: 400 });
  }
  const perShop = await sharedRateLimit({ key: `book:shop:${shop.id}`, limit: 60, windowMs: 60 * 60_000 });
  if (!perShop.ok) return tooManyRequests(perShop.retryAfterSec, "Online booking is busy. Call the business to book.");

  const result = await bookOnline(shop, parsed.data);
  if (!result.ok) {
    const status = result.reason === "slot_taken" ? 409 : 400;
    return NextResponse.json({ error: result.message, reason: result.reason }, { status });
  }
  return NextResponse.json(result);
}
