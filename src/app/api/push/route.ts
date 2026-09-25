import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireBusinessSession } from "@/lib/tenant";
import { pushPublicKey, sendOwnerPush } from "@/lib/web-push";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

export async function GET() {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult.error;
  const devices = await prisma.pushSubscription.count({ where: { businessId: authResult.business.id } });
  return NextResponse.json({ publicKey: pushPublicKey(), devices });
}

/** Turn on push for this browser, or send a test with { test: true }. */
export async function POST(request: Request) {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult.error;
  const businessId = authResult.business.id;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (body?.test) {
    const delivered = await sendOwnerPush(businessId, {
      title: authResult.business.name,
      body: "Push alerts are on. New calls and urgent jobs will show up here.",
      tag: "orvius-test",
    });
    return NextResponse.json({ delivered });
  }

  const parsed = subscriptionSchema.safeParse(body?.subscription);
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  const { endpoint, keys } = parsed.data;
  const userAgent = request.headers.get("user-agent")?.slice(0, 200) ?? null;
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { businessId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    update: { businessId, p256dh: keys.p256dh, auth: keys.auth, userAgent },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult.error;
  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  await prisma.pushSubscription.deleteMany({
    where: { businessId: authResult.business.id, endpoint: body.endpoint },
  });
  return NextResponse.json({ ok: true });
}
