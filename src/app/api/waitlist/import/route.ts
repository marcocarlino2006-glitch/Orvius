import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { parseProspectCsv } from "@/lib/prospect-csv";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/env";
import { z } from "zod";

function allowedEmails(): Set<string> {
  return new Set(
    (process.env.ORVIUS_AUTH_ALLOWED_EMAILS?.split(",") ?? [])
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function canManageProspects(request: Request) {
  if (verifyAdminRequest(request)) return true;
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return false;
  const allowed = allowedEmails();
  if (allowed.size === 0) return true;
  return allowed.has(email);
}

const bodySchema = z.object({
  csv: z.string().min(1).max(500_000),
});

/**
 * Bulk import prospects into waitlist / pipeline.
 * Dedupes by email. Sets nextActionAt=now so they show due today.
 */
export async function POST(request: NextRequest) {
  if (!(await canManageProspects(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { csv } = bodySchema.parse(await request.json());
    const parsed = parseProspectCsv(csv);

    if (parsed.rows.length === 0) {
      return NextResponse.json(
        {
          error: "No valid rows to import",
          parseErrors: parsed.errors,
          skipped: parsed.skipped,
        },
        { status: 400 },
      );
    }

    const now = new Date();
    let created = 0;
    let updated = 0;

    for (const row of parsed.rows) {
      const existing = await prisma.waitlistEntry.findFirst({
        where: { email: row.email },
      });

      if (existing) {
        await prisma.waitlistEntry.update({
          where: { id: existing.id },
          data: {
            businessName: row.businessName ?? existing.businessName,
            phone: row.phone ?? existing.phone,
            trade: row.trade ?? existing.trade,
            city: row.city ?? existing.city,
            nextActionAt: existing.nextActionAt ?? now,
          },
        });
        updated++;
      } else {
        await prisma.waitlistEntry.create({
          data: {
            email: row.email,
            businessName: row.businessName,
            phone: row.phone,
            trade: row.trade,
            city: row.city,
            plan: "pilot",
            status: "new",
            nextActionAt: now,
          },
        });
        created++;
      }
    }

    return NextResponse.json({
      ok: true,
      created,
      updated,
      skipped: parsed.skipped,
      parseErrors: parsed.errors,
      total: parsed.rows.length,
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.errors.map((e) => e.message).join(", ")
        : error instanceof Error
          ? error.message
          : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
