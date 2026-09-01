import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBusinessSession } from "@/lib/tenant";

export async function GET() {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult.error;

  const business = authResult.business;
  const line =
    business.vapiPhoneNumber ??
    business.twilioPhone ??
    process.env.TWILIO_PHONE_NUMBER?.trim() ??
    null;

  const [firstCall, firstLead, recentLead] = await Promise.all([
    prisma.call.findFirst({
      where: { businessId: business.id, status: "completed" },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, callerPhone: true },
    }),
    prisma.lead.findFirst({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, createdAt: true, source: true },
    }),
    prisma.lead.findFirst({
      where: {
        businessId: business.id,
        createdAt: { gte: business.createdAt },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, createdAt: true },
    }),
  ]);

  const verified = Boolean(business.lineVerifiedAt || firstCall || firstLead);

  return NextResponse.json({
    verified,
    line,
    lineVerifiedAt: business.lineVerifiedAt?.toISOString() ?? null,
    firstCall: firstCall
      ? {
          id: firstCall.id,
          at: firstCall.createdAt.toISOString(),
          callerPhone: firstCall.callerPhone,
        }
      : null,
    firstLead: recentLead
      ? {
          id: recentLead.id,
          name: recentLead.name,
          at: recentLead.createdAt.toISOString(),
        }
      : null,
  });
}
