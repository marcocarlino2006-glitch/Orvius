import { NextResponse } from "next/server";
import { financingFor, financingLine } from "@/lib/financing";
import { z } from "zod";

import {
  createInvoiceCheckoutSession,
  fulfillInvoiceCheckoutSession,
  getInvoiceByToken,
  invoiceOpenBalanceCents,
} from "@/lib/invoice-pay";
import { collectedCents } from "@/lib/payment-math";
import { formatCentsExact } from "@/lib/money";
import { isChargeableAmount } from "@/lib/platform-fee";
import { publicTokenLimited } from "@/lib/rate-limit";
import { getStripe } from "@/lib/stripe";
import { getConnectStatus } from "@/lib/stripe-connect";
import { formatTaxRate } from "@/lib/sales-tax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };
type LoadedInvoice = NonNullable<Awaited<ReturnType<typeof getInvoiceByToken>>>;

/** Work, tax and any deposit, so the total on the page adds up line by line. */
function breakdown(invoice: LoadedInvoice) {
  const paidSoFar = invoice.status === "paid" ? 0 : collectedCents(invoice.payments);
  const refunded = invoice.payments.filter((p) => p.status === "refunded").reduce((sum, p) => sum + p.amountCents, 0);
  const paidLine = [
    ...(paidSoFar > 0 ? [{ label: "Paid so far", value: `−${formatCentsExact(paidSoFar)}` }] : []),
    ...(refunded > 0 ? [{ label: "Refunded to you", value: formatCentsExact(refunded) }] : []),
  ];
  if (invoice.subtotalCents == null || invoice.taxCents <= 0) {
    return paidLine.length ? [{ label: "Invoice total", value: formatCentsExact(invoice.amountCents) }, ...paidLine] : null;
  }
  const credited = invoice.subtotalCents + invoice.taxCents - invoice.amountCents;
  return [
    { label: "Work", value: formatCentsExact(invoice.subtotalCents) },
    { label: `Sales tax (${formatTaxRate(invoice.taxBps)})`, value: formatCentsExact(invoice.taxCents) },
    ...(credited > 0 ? [{ label: "Deposit paid", value: `−${formatCentsExact(credited)}` }] : []),
    ...paidLine,
  ];
}

function serializePublic(invoice: LoadedInvoice) {
  const balanceCents = invoiceOpenBalanceCents(invoice);
  const paid = invoice.status === "paid" || balanceCents === 0;
  return {
    status: paid ? "paid" : invoice.status,
    amountLabel: formatCentsExact(paid ? invoice.amountCents : balanceCents),
    lines: breakdown(invoice),
    jobTitle: invoice.job?.title ?? null,
    shopName: invoice.business.name,
    shopPhone: invoice.business.phone,
    paid,
    cardPayAvailable:
      !paid && getConnectStatus(invoice.business).canAcceptPayments && isChargeableAmount(balanceCents),
    financing:
      getConnectStatus(invoice.business).canAcceptPayments && !paid
        ? financingLine(financingFor(invoice.business, balanceCents))
        : null,
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

    if (invoice.status === "paid" || invoiceOpenBalanceCents(invoice) === 0) {
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
