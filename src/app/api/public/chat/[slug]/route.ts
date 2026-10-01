import { NextResponse } from "next/server";
import { z } from "zod";
import { publicShop } from "@/lib/online-booking";
import { clientIp, publicTokenLimited, sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { startWebChat } from "@/lib/web-chat";

type Params = { params: Promise<{ slug: string }> };

const notFound = () => NextResponse.json({ error: "Chat isn't available for this business." }, { status: 404 });

export async function GET(request: Request, { params }: Params) {
  const limited = await publicTokenLimited(request, "chat", "GET");
  if (limited) return limited;
  const shop = await publicShop((await params).slug, "webChatOn");
  if (!shop) return notFound();
  return NextResponse.json({
    business: { name: shop.name, phone: shop.vapiPhoneNumber ?? shop.twilioPhone ?? null },
    booking: shop.bookingPageOn ? `/b/${shop.slug}` : null,
  });
}

const ChatBody = z.object({
  name: z.string().max(120).optional().default(""),
  phone: z.string().min(7).max(40),
  message: z.string().trim().min(1).max(1000),
  page: z.string().max(300).optional(),
  website: z.string().max(200).optional(),
});

export async function POST(request: Request, { params }: Params) {
  const limited = await publicTokenLimited(request, "chat", "POST");
  if (limited) return limited;
  const perIp = await sharedRateLimit({ key: `chat:ip:${clientIp(request)}`, limit: 5, windowMs: 60 * 60_000 });
  if (!perIp.ok) return tooManyRequests(perIp.retryAfterSec, "Too many messages from this connection. Call the business instead.");

  const shop = await publicShop((await params).slug, "webChatOn");
  if (!shop) return notFound();

  const parsed = ChatBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Add a message and your mobile number." }, { status: 400 });
  if (parsed.data.website) return NextResponse.json({ error: "Something went wrong. Call the business instead." }, { status: 400 });

  const perShop = await sharedRateLimit({ key: `chat:shop:${shop.id}`, limit: 120, windowMs: 60 * 60_000 });
  if (!perShop.ok) return tooManyRequests(perShop.retryAfterSec, "Chat is busy right now. Call the business instead.");

  const result = await startWebChat(shop, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.message, reason: result.reason }, { status: 400 });
  return NextResponse.json(result);
}
