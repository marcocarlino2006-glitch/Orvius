import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notifyOwner } from "@/lib/notifications";
import { verifyAdminRequest } from "@/lib/env";
import { z } from "zod";

const PIPELINE_STATUSES = [
  "new",
  "contacted",
  "demoed",
  "onboarded",
  "live",
  "closed",
] as const;

const waitlistSchema = z.object({
  email: z.string().email(),
  businessName: z.string().optional(),
  phone: z.string().optional(),
  trade: z.string().optional(),
  city: z.string().optional(),
  plan: z.enum(["pilot", "pro"]).optional(),
});

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(PIPELINE_STATUSES).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

function allowedEmails(): Set<string> {
  return new Set(
    (process.env.ORVIUS_AUTH_ALLOWED_EMAILS?.split(",") ?? [])
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Admin key OR signed-in founder (allowed-email list). */
async function canManageProspects(request: Request) {
  if (verifyAdminRequest(request)) return true;
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return false;
  const allowed = allowedEmails();
  if (allowed.size === 0) return true;
  return allowed.has(email);
}

export async function GET(request: NextRequest) {
  if (!(await canManageProspects(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entries = await prisma.waitlistEntry.findMany({
    orderBy: { createdAt: "desc" },
  });

  const byStatus = PIPELINE_STATUSES.reduce(
    (acc, status) => {
      acc[status] = entries.filter((e) => e.status === status).length;
      return acc;
    },
    {} as Record<(typeof PIPELINE_STATUSES)[number], number>,
  );

  return NextResponse.json({
    count: entries.length,
    byStatus,
    statuses: PIPELINE_STATUSES,
    entries,
  });
}

export async function PATCH(request: NextRequest) {
  if (!(await canManageProspects(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = patchSchema.parse(await request.json());
    const entry = await prisma.waitlistEntry.update({
      where: { id: body.id },
      data: {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
    });
    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.errors.map((e) => e.message).join(", ")
        : error instanceof Error
          ? error.message
          : "Update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = waitlistSchema.parse(await request.json());

    const entry = await prisma.waitlistEntry.upsert({
      where: { email: body.email.toLowerCase() },
      create: {
        email: body.email.toLowerCase(),
        businessName: body.businessName ?? null,
        phone: body.phone ?? null,
        trade: body.trade ?? null,
        city: body.city ?? null,
        plan: body.plan ?? "pilot",
      },
      update: {
        businessName: body.businessName ?? undefined,
        phone: body.phone ?? undefined,
        trade: body.trade ?? undefined,
        city: body.city ?? undefined,
        plan: body.plan ?? undefined,
        status: "new",
      },
    });

    const notifyPhone = process.env.ORVIUS_FOUNDER_PHONE;
    if (notifyPhone) {
      await notifyOwner({
        ownerPhone: notifyPhone,
        businessName: "Orvius",
        message: [
          "New waitlist signup",
          body.businessName ? `Business: ${body.businessName}` : null,
          `Email: ${body.email}`,
          body.phone ? `Phone: ${body.phone}` : null,
          body.trade ? `Trade: ${body.trade}` : null,
          body.city ? `City: ${body.city}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        dedupeKey: `waitlist:${entry.id}`,
      });
    }

    console.info("[waitlist] new signup:", entry.email);

    return NextResponse.json({ ok: true, id: entry.id }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "Valid email required"
        : error instanceof Error
          ? error.message
          : "Signup failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
