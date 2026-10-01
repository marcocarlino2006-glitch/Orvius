import { NextRequest, NextResponse } from "next/server";
import { parseMedia } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { requireEntitledSession } from "@/lib/tenant";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * A customer's MMS photo, fetched from Twilio with the account credentials and
 * served only to someone signed in to the shop that received it. Twilio media
 * can require HTTP auth, and its URL must never reach another tenant.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const id = request.nextUrl.searchParams.get("id") ?? "";
  const index = Number(request.nextUrl.searchParams.get("i") ?? 0);
  if (!id || !Number.isInteger(index) || index < 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const message = await prisma.message.findFirst({ where: { id, businessId: business.id }, select: { mediaJson: true } });
  const item = parseMedia(message?.mediaJson)[index];
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const upstream = await fetch(item.url, {
    headers: sid && token ? { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` } : {},
    redirect: "follow",
    cache: "no-store",
  }).catch(() => null);
  if (!upstream?.ok) return NextResponse.json({ error: "Photo unavailable" }, { status: 502 });

  const type = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? item.type;
  if (!type.startsWith("image/")) return NextResponse.json({ error: "Photo unavailable" }, { status: 502 });
  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) return NextResponse.json({ error: "Photo too large" }, { status: 413 });

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}
