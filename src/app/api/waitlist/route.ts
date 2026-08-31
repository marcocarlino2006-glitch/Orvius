import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyOwner } from "@/lib/notifications";
import { verifyAdminRequest } from "@/lib/env";
import { z } from "zod";

const waitlistSchema = z.object({
  email: z.string().email(),
  businessName: z.string().optional(),
  phone: z.string().optional(),
  trade: z.string().optional(),
  city: z.string().optional(),
  plan: z.enum(["pilot", "pro"]).optional(),
});

export async function GET(request: NextRequest) {
  if (!verifyAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entries = await prisma.waitlistEntry.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    count: entries.length,
    entries,
  });
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
