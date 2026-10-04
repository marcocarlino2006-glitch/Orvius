import { NextResponse } from "next/server";
import { z } from "zod";
import { personActor } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { releaseConversation, takeOverConversation } from "@/lib/takeover";
import { requireEntitledSession } from "@/lib/tenant";

const bodySchema = z.object({
  leadId: z.string().optional(),
  phone: z.string().optional(),
  release: z.boolean().optional(),
  reason: z.string().max(200).optional(),
});

/** Take a customer's texts over from Orvius, or hand them back. */
export async function POST(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const body = parsed.data;
  let phone = body.phone ?? null;
  if (body.leadId) {
    const lead = await prisma.lead.findFirst({ where: { id: body.leadId, businessId: business.id }, select: { phone: true } });
    if (!lead) return NextResponse.json({ error: "Request not found" }, { status: 404 });
    phone = lead.phone;
  }
  if (!phone) return NextResponse.json({ error: "No phone to take over" }, { status: 400 });
  const by = { email: authResult.email, actor: personActor(authResult).actor };
  const result = body.release
    ? await releaseConversation({ businessId: business.id, phone, by })
    : await takeOverConversation({ businessId: business.id, phone, leadId: body.leadId, by, reason: body.reason });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
