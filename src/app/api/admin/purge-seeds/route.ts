import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isFounderEmail } from "@/lib/founder";
import { looksLikeSeedProspect } from "@/lib/multi-b-mastery";
import { prisma } from "@/lib/prisma";

/**
 * Founder-only: delete waitlist rows that look like seed/example contacts.
 * Real outreach cannot start while seeds count as density.
 */
export async function POST() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email || !isFounderEmail(email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entries = await prisma.waitlistEntry.findMany({
    select: { id: true, email: true },
  });
  const seedIds = entries
    .filter((row) => looksLikeSeedProspect(row.email))
    .map((row) => row.id);

  if (seedIds.length === 0) {
    return NextResponse.json({
      ok: true,
      deleted: 0,
      remaining: entries.length,
      message: "No seed/example prospects found.",
    });
  }

  await prisma.waitlistEntry.deleteMany({
    where: { id: { in: seedIds } },
  });

  const remaining = await prisma.waitlistEntry.count();
  return NextResponse.json({
    ok: true,
    deleted: seedIds.length,
    remaining,
    message: `Removed ${seedIds.length} seed prospect(s). Import a real CSV next.`,
  });
}
