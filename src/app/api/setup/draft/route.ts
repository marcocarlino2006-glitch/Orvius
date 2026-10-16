import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { isTrade } from "@/lib/trades";

/*
  The sign-up form, kept on the server for the signed-in email. It holds only
  what the owner typed or chose to import; it never creates a shop, a line or
  a charge. Imported facts keep their source so the form can say so.
*/

const draftSchema = z.object({
  name: z.string().trim().max(80).default(""),
  trade: z.string().refine(isTrade).optional(),
  ownerPhone: z.string().trim().max(32).default(""),
  areaCode: z.string().regex(/^\d{0,3}$/).default(""),
  found: z
    .object({
      address: z.string().max(200).nullable(),
      hoursJson: z.string().max(2000).nullable(),
      source: z.string().max(20),
    })
    .nullable()
    .optional(),
});

async function email() {
  const session = await auth();
  return session?.user?.email?.toLowerCase() ?? null;
}

export async function GET() {
  const who = await email();
  if (!who) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const row = await prisma.setupDraft.findUnique({ where: { email: who } });
  if (!row) return NextResponse.json({ draft: null });
  const parsed = draftSchema.safeParse(JSON.parse(row.json));
  return NextResponse.json({ draft: parsed.success ? parsed.data : null, savedAt: row.updatedAt.toISOString() });
}

export async function PUT(request: Request) {
  const who = await email();
  if (!who) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const limited = await sharedRateLimit({ key: `setup-draft:${who}`, limit: 30, windowMs: 60_000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);
  const parsed = draftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That draft couldn't be saved." }, { status: 400 });
  const json = JSON.stringify(parsed.data);
  const row = await prisma.setupDraft.upsert({ where: { email: who }, create: { email: who, json }, update: { json } });
  return NextResponse.json({ ok: true, savedAt: row.updatedAt.toISOString() });
}

export async function DELETE() {
  const who = await email();
  if (!who) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  await prisma.setupDraft.deleteMany({ where: { email: who } });
  return NextResponse.json({ ok: true });
}
