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
  /** The form's edit count. A save carrying a count at or below the kept one is late, so it can't overwrite newer typing. */
  rev: z.number().int().min(0).max(1_000_000).optional(),
});

type Draft = z.infer<typeof draftSchema>;

function readRow(json: string): Draft | null {
  try {
    const parsed = draftSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const sameContent = (a: Draft, b: Draft) => JSON.stringify({ ...a, rev: 0 }) === JSON.stringify({ ...b, rev: 0 });

async function email() {
  const session = await auth();
  return session?.user?.email?.toLowerCase() ?? null;
}

export async function GET() {
  const who = await email();
  if (!who) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const row = await prisma.setupDraft.findUnique({ where: { email: who } });
  if (!row) return NextResponse.json({ draft: null, rev: 0 });
  const draft = readRow(row.json);
  return NextResponse.json({ draft, rev: draft?.rev ?? 0, savedAt: row.updatedAt.toISOString() });
}

export async function PUT(request: Request) {
  const who = await email();
  if (!who) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const limited = await sharedRateLimit({ key: `setup-draft:${who}`, limit: 30, windowMs: 60_000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);
  const parsed = draftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That draft couldn't be saved." }, { status: 400 });
  const incoming = parsed.data;
  /* Compare-and-set on the stored form, so two saves racing can't both pass the revision check. */
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await prisma.setupDraft.findUnique({ where: { email: who } });
    const kept = existing ? readRow(existing.json) : null;
    const keptRev = kept?.rev ?? 0;
    if (existing && kept && incoming.rev != null && incoming.rev <= keptRev) {
      if (sameContent(kept, incoming)) return NextResponse.json({ ok: true, rev: keptRev, savedAt: existing.updatedAt.toISOString() });
      return NextResponse.json(
        { error: "A newer version of this form is already saved.", code: "stale_draft", draft: kept, rev: keptRev, savedAt: existing.updatedAt.toISOString() },
        { status: 409 },
      );
    }
    /* A save without a count comes from a page loaded before counts existed; it lands, one past what's kept. */
    const rev = incoming.rev ?? keptRev + 1;
    const json = JSON.stringify({ ...incoming, rev });
    if (!existing) {
      try {
        const row = await prisma.setupDraft.create({ data: { email: who, json } });
        return NextResponse.json({ ok: true, rev, savedAt: row.updatedAt.toISOString() });
      } catch {
        continue;
      }
    }
    const moved = await prisma.setupDraft.updateMany({ where: { email: who, json: existing.json }, data: { json } });
    if (moved.count) {
      const row = await prisma.setupDraft.findUniqueOrThrow({ where: { email: who } });
      return NextResponse.json({ ok: true, rev, savedAt: row.updatedAt.toISOString() });
    }
  }
  return NextResponse.json({ error: "Another save landed at the same moment. Try again.", code: "draft_busy" }, { status: 409 });
}

export async function DELETE() {
  const who = await email();
  if (!who) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  await prisma.setupDraft.deleteMany({ where: { email: who } });
  return NextResponse.json({ ok: true });
}
