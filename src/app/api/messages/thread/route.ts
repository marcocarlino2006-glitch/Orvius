import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { personActor, recordAudit } from "@/lib/audit";
import { sendCustomerSms } from "@/lib/customer-sms";
import { getThread, markThreadRead } from "@/lib/messages";
import { sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { requireEntitledSession } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const phone = request.nextUrl.searchParams.get("phone") ?? "";
  const thread = await getThread(business.id, phone);
  if (!thread) return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  await markThreadRead(business.id, thread.phone);
  return NextResponse.json(thread);
}

const SendBody = z.object({
  phone: z.string().min(7).max(40),
  body: z.string().trim().min(1).max(1200),
});

const SEND_ERRORS = {
  invalid_customer_phone: { status: 400, error: "That phone number can't receive texts." },
  unsupported_destination: { status: 400, error: "Orvius only texts US and Canadian numbers." },
  customer_opted_out: {
    status: 409,
    error: "This customer replied STOP. They have to text START before you can text them again.",
  },
  sms_not_configured: { status: 503, error: "Texting isn't set up for this workspace yet." },
  human_takeover: { status: 409, error: "Someone took this conversation over. Hand it back to Orvius first." },
} as const;

export async function POST(request: NextRequest) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business, role, email } = authResult;

  const parsed = SendBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Write a message up to 1,200 characters." }, { status: 400 });
  }

  const limited = await sharedRateLimit({
    key: `owner-text:${business.id}`,
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec, "Too many texts this hour. Wait a few minutes.");

  const result = await sendCustomerSms({
    businessId: business.id,
    to: parsed.data.phone,
    body: parsed.data.body,
    author: "owner",
  });
  if (!result.sent) {
    const failure = SEND_ERRORS[result.reason];
    return NextResponse.json({ error: failure.error, reason: result.reason }, { status: failure.status });
  }

  await recordAudit({
    businessId: business.id,
    entityType: "customer",
    entityId: parsed.data.phone,
    action: "message.sent",
    summary: `Text sent to ${parsed.data.phone}`,
    detail: { sid: result.sid },
    ...personActor({ role, email }),
  });

  const thread = await getThread(business.id, parsed.data.phone);
  return NextResponse.json({ sent: true, sid: result.sid, thread });
}
