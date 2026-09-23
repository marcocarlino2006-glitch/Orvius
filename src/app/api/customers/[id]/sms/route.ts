import { NextResponse } from "next/server";
import { z } from "zod";
import { sendCustomerSms } from "@/lib/customer-sms";
import { withSmsOptOutFooter } from "@/lib/sms-keywords";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { requireEntitledSession } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

const MAX_BODY = 1400;
const LIST_LIMIT = 100;

const postSchema = z.object({
  body: z.string().trim().min(1).max(MAX_BODY),
});

async function loadOwnedCustomer(customerId: string, businessId: string) {
  return prisma.customer.findFirst({
    where: { id: customerId, businessId },
    select: {
      id: true,
      phone: true,
      phoneNormalized: true,
      name: true,
    },
  });
}

/** List Texts thread for a customer (newest last for chat-style UI). */
export async function GET(_request: Request, { params }: Params) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "customers");
  if ("error" in planGate) return planGate.error;

  const { id } = await params;
  const customer = await loadOwnedCustomer(id, business.id);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const messages = await prisma.customerSms.findMany({
    where: { customerId: customer.id, businessId: business.id },
    orderBy: { createdAt: "asc" },
    take: LIST_LIMIT,
    select: {
      id: true,
      direction: true,
      body: true,
      status: true,
      twilioSid: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    customer: {
      id: customer.id,
      phone: customer.phone,
      name: customer.name,
    },
    messages: messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

/** Owner reply on the customer Texts thread. */
export async function POST(request: Request, { params }: Params) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "customers");
  if ("error" in planGate) return planGate.error;

  const { id } = await params;
  const customer = await loadOwnedCustomer(id, business.id);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await request.json());
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.errors.map((e) => e.message).join(", ")
        : "Invalid body";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const text = withSmsOptOutFooter(body.body);
  const result = await sendCustomerSms({
    businessId: business.id,
    to: customer.phone,
    body: text,
    customerId: customer.id,
  });

  if (!result.sent) {
    const status =
      result.reason === "sms_not_configured"
        ? 503
        : result.reason === "customer_opted_out"
          ? 403
          : 400;
    return NextResponse.json(
      {
        error:
          result.reason === "customer_opted_out"
            ? "Customer opted out of SMS (STOP)"
            : result.reason === "sms_not_configured"
              ? "SMS is not configured"
              : "Invalid customer phone",
        reason: result.reason,
      },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    sid: result.sid,
    messageId: result.messageId,
    body: text,
    direction: "outbound",
  });
}
