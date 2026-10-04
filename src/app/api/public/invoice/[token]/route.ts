import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createInvoiceCheckoutSession,
  fulfillInvoiceCheckoutSession,
  getInvoiceByToken,
} from "@/lib/invoice-pay";
import { formatCentsExact } from "@/lib/money";
import { isChargeableAmount } from "@/lib/platform-fee";
import { publicTokenLimited } from "@/lib/rate-limit";
import { getStripe } from "@/lib/stripe";
import { getConnectStatus } from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };
type LoadedInvoice = NonNullable<Awaited<ReturnType<typeof getInvoiceByToken>>>;

function serializePublic(invoice: LoadedInvoice) {
  return {
    status: invoice.status,
    amountLabel: formatCentsExact(invoice.amountCents),
    jobTitle: invoice.job?.title ?? null,
    shopName: invoice.business.name,
    shopPhone: invoice.business.phone,
    paid: invoice.status === "paid",
    cardPayAvailable:
      getConnectStatus(invoice.business).canAcceptPayments && isChargeableAmount(invoice.amountCents),
    paidAt: invoice.paidAt?.toISOString() ?? null,
  };
}

export async function GET(request: Request, { params }: Params) {
  const limited = await publicTokenLimited(request, "invoice", "GET");
  if (limited) return limited;
  const { token } = await params;
  const invoice = await getInvoiceByToken(token);
  if (!invoice?.publicToken) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  return NextResponse.json(
    { invoice: serializePublic(invoice) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const actionSchema = z.object({
  action: z.enum(["pay_card", "confirm_card"]),
  sessionId: z.string().min(1).optional(),
});

export async function POST(request: Request, { params }: Params) {
  const limited = await publicTokenLimited(request, "invoice", "POST");
  if (limited) return limited;
  const { token } = await params;
  const invoice = await getInvoiceByToken(token);
  if (!invoice?.publicToken) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  const connect = getConnectStatus(invoice.business);

  try {
    const body = actionSchema.parse(await request.json());
    if (!connect.canAcceptPayments || !connect.accountId) {
      return NextResponse.json({ error: "This shop is not set up to take cards yet" }, { status: 503 });
    }

    if (body.action === "confirm_card") {
      if (!body.sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
      const session = await getStripe().checkout.sessions.retrieve(body.sessionId, {
        stripeAccount: connect.accountId,
      });
      if (session.metadata?.publicToken !== token) {
        return NextResponse.json({ error: "Session mismatch" }, { status: 400 });
      }
      await fulfillInvoiceCheckoutSession(session);
      const fresh = await getInvoiceByToken(token);
      return NextResponse.json({ ok: true, invoice: fresh ? serializePublic(fresh) : null });
    }

    if (invoice.status === "paid") {
      return NextResponse.json({ ok: true, alreadyPaid: true, invoice: serializePublic(invoice) });
    }

    const session = await createInvoiceCheckoutSession({
      invoice,
      business: invoice.business,
      jobTitle: invoice.job?.title,
    });
    if (!session.url) {
      return NextResponse.json({ error: "Could not start card checkout" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, checkoutUrl: session.url });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.errors.map((e) => e.message).join(", ")
        : error instanceof Error
          ? error.message
          : "Action failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
