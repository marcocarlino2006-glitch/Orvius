import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notifyOwner } from "@/lib/notifications";
import { verifyAdminRequest } from "@/lib/env";
import { isFounderEmail } from "@/lib/founder";
import { logWarn } from "@/lib/logger";
import { z } from "zod";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const PIPELINE_STATUSES = [
  "new",
  "contacted",
  "demoed",
  "onboarded",
  "live",
  "closed",
] as const;

const waitlistSchema = z.object({
  email: z.string().trim().email().max(254),
  businessName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  trade: z.string().trim().max(60).optional(),
  city: z.string().trim().max(120).optional(),
  plan: z.enum(["pilot", "pro"]).optional(),
  website: z.string().max(200).optional(),
});

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(PIPELINE_STATUSES).optional(),
  notes: z.string().max(2000).nullable().optional(),
  nextActionAt: z.string().datetime().nullable().optional(),
  lastContactedAt: z.string().datetime().nullable().optional(),
});

/** Admin key OR explicitly configured founder. Never every signed-in shop. */
async function canManageProspects(request: Request) {
  if (verifyAdminRequest(request)) return true;
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  return isFounderEmail(email);
}

export async function GET(request: NextRequest) {
  if (!(await canManageProspects(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entries = await prisma.waitlistEntry.findMany({
    orderBy: { createdAt: "desc" },
  });

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const dueToday = entries.filter((e) => {
    if (!e.nextActionAt) return false;
    const t = new Date(e.nextActionAt).getTime();
    return t >= start.getTime() && t < end.getTime();
  });

  const overdue = entries.filter((e) => {
    if (!e.nextActionAt) return false;
    return new Date(e.nextActionAt).getTime() < start.getTime();
  });

  const touchedToday = entries.filter((e) => {
    if (!e.lastContactedAt) return false;
    const t = new Date(e.lastContactedAt).getTime();
    return t >= start.getTime() && t < end.getTime();
  });

  /** Due-first: overdue → due today → no date → future */
  const sorted = [...entries].sort((a, b) => {
    const rank = (e: (typeof entries)[number]) => {
      if (!e.nextActionAt) return 2;
      const t = new Date(e.nextActionAt).getTime();
      if (t < start.getTime()) return 0;
      if (t < end.getTime()) return 1;
      return 3;
    };
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const ta = a.nextActionAt ? new Date(a.nextActionAt).getTime() : 0;
    const tb = b.nextActionAt ? new Date(b.nextActionAt).getTime() : 0;
    return ta - tb;
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
    dueTodayCount: dueToday.length,
    overdueCount: overdue.length,
    touchesTodayCount: touchedToday.length,
    dailyTarget: 20,
    statuses: PIPELINE_STATUSES,
    entries: sorted,
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
        ...(body.nextActionAt !== undefined
          ? {
              nextActionAt: body.nextActionAt
                ? new Date(body.nextActionAt)
                : null,
            }
          : {}),
        ...(body.lastContactedAt !== undefined
          ? {
              lastContactedAt: body.lastContactedAt
                ? new Date(body.lastContactedAt)
                : null,
            }
          : {}),
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
  const ip = clientIp(request);
  const limited = rateLimit({
    key: `waitlist:${ip}`,
    limit: 8,
    windowMs: 60 * 60 * 1000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSec) },
      },
    );
  }

  try {
    const body = waitlistSchema.parse(await request.json());
    // Quiet honeypot: bots usually populate every field. Return a normal
    // response without creating noise in the founder pipeline.
    if (body.website?.trim()) {
      return NextResponse.json({ ok: true, id: "accepted" }, { status: 201 });
    }

    const normalizedEmail = body.email.toLowerCase();
    const existing = await prisma.waitlistEntry.findUnique({
      where: { email: normalizedEmail },
      select: { status: true },
    });
    const entry = await prisma.waitlistEntry.upsert({
      where: { email: normalizedEmail },
      create: {
        email: normalizedEmail,
        businessName: body.businessName ?? null,
        phone: body.phone ?? null,
        trade: body.trade ?? null,
        city: body.city ?? null,
        plan: body.plan ?? "pro",
      },
      update: {
        businessName: body.businessName ?? undefined,
        phone: body.phone ?? undefined,
        trade: body.trade ?? undefined,
        city: body.city ?? undefined,
        plan: body.plan ?? undefined,
        /*
          A previously closed owner asking again is a new sales signal. Routine
          duplicate submissions keep their current pipeline position.
        */
        ...(existing?.status === "closed"
          ? { status: "new", nextActionAt: null }
          : {}),
      },
    });

    const notifyPhone = process.env.ORVIUS_FOUNDER_PHONE;
    if (notifyPhone) {
      try {
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
      } catch (error) {
        // The signup is the source of truth. A provider outage must not tell a
        // prospect their request failed after it was already stored.
        logWarn("waitlist.founder_notification_failed", {
          entryId: entry.id,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
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
