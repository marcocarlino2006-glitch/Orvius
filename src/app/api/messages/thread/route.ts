import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { personActor, recordAudit } from "@/lib/audit";
import { normalizePhone } from "@/lib/customer";
import { sendCustomerSms } from "@/lib/customer-sms";
import { getThread, markThreadRead } from "@/lib/messages";
import { classifySendError, findIntent } from "@/lib/sms-intent";
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
  return NextResponse.json({ ...thread, timezone: business.timezone });
}

const SendBody = z.object({
  phone: z.string().min(7).max(40),
  body: z.string().trim().min(1).max(1200),
  /** One per typed message, kept across retries, so a lost reply or a second press can't send it twice. */
  operationKey: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/).optional(),
});

const OWNER_TEXT_EVENT = "owner.text";

const MAY_HAVE_GONE =
  "The text service didn't answer, so this text may have gone out. Orvius won't send it again; check the thread before writing it again.";

type PriorIntent = NonNullable<Awaited<ReturnType<typeof findIntent>>>;

/** What a send already on the ledger under this key means, without sending again. */
async function priorReply(businessId: string, phone: string, prior: PriorIntent) {
  if (["submitted", "delivered", "undelivered"].includes(prior.status)) {
    const thread = await getThread(businessId, phone);
    return NextResponse.json({ sent: true, duplicate: true, sid: prior.providerSid, thread });
  }
  if (prior.status === "leased") {
    return NextResponse.json(
      { sent: null, pending: true, error: "This text is still sending. Give it a moment, then check the thread." },
      { status: 202 },
    );
  }
  if (prior.status === "unknown_submission") {
    return NextResponse.json({ sent: null, unknown: true, error: MAY_HAVE_GONE }, { status: 202 });
  }
  return NextResponse.json(
    { sent: false, refused: true, error: "The text service refused this text. It wasn't sent." },
    { status: 502 },
  );
}

const SEND_ERRORS = {
  invalid_customer_phone: { status: 400, error: "That phone number can't receive texts." },
  unsupported_destination: { status: 400, error: "Orvius only texts US and Canadian numbers." },
  customer_opted_out: {
    status: 409,
    error: "This customer replied STOP. They have to text START before you can text them again.",
  },
  sms_not_configured: { status: 503, error: "Texting isn't set up for this workspace yet." },
  sender_not_verified: { status: 503, error: "Texting isn't verified with the carriers yet. Your message was not sent; call the customer instead." },
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

  const { operationKey } = parsed.data;
  const to = normalizePhone(parsed.data.phone);
  const ledgerKey = operationKey && to
    ? { businessId: business.id, eventType: OWNER_TEXT_EVENT, eventId: operationKey, to }
    : null;
  if (ledgerKey) {
    const prior = await findIntent(ledgerKey);
    if (prior) return priorReply(business.id, parsed.data.phone, prior);
  }

  const limited = await sharedRateLimit({
    key: `owner-text:${business.id}`,
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec, "Too many texts this hour. Wait a few minutes.");

  let result: Awaited<ReturnType<typeof sendCustomerSms>>;
  try {
    result = await sendCustomerSms({
      businessId: business.id,
      to: parsed.data.phone,
      body: parsed.data.body,
      author: "owner",
      intent: operationKey ? { eventType: OWNER_TEXT_EVENT, eventId: operationKey, authorizedBy: email ?? role } : undefined,
    });
  } catch (error) {
    const after = ledgerKey ? await findIntent(ledgerKey) : null;
    if (after) return priorReply(business.id, parsed.data.phone, after);
    if (classifySendError(error) === "unknown_submission") {
      return NextResponse.json({ sent: null, unknown: true, error: MAY_HAVE_GONE }, { status: 202 });
    }
    return NextResponse.json(
      { sent: false, refused: true, error: "The text service refused this text. It wasn't sent." },
      { status: 502 },
    );
  }
  if (!result.sent && ledgerKey) {
    // A twin press that lost the claim comes back here as "not configured"; the ledger knows better.
    const twin = await findIntent(ledgerKey);
    if (twin) return priorReply(business.id, parsed.data.phone, twin);
  }
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
