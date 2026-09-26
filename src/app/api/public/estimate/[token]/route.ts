import { NextResponse } from "next/server";
import {
  createEstimateCheckoutSession,
  ensureInvoiceForEstimate,
  fulfillEstimateCheckoutSession,
  isEstimateCardPayReady,
} from "@/lib/estimate-pay";
import { formatCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { z } from "zod";
import { publicTokenLimited } from "@/lib/rate-limit";

type Params = { params: Promise<{ token: string }> };

/** Card pay is a direct charge, so the shop's Connect state has to come along. */
const BUSINESS_SELECT = {
  id: true,
  name: true,
  stripeConnectAccountId: true,
  stripeConnectChargesEnabled: true,
  stripeConnectPayoutsEnabled: true,
  stripeConnectDetailsSubmitted: true,
} as const;

async function loadEstimate(token: string) {
  return prisma.estimate.findFirst({
    where: { publicToken: token },
    include: {
      business: { select: BUSINESS_SELECT },
      job: { select: { id: true, title: true, address: true } },
      invoice: {
        include: {
          payments: {
            select: { id: true, amountCents: true, status: true, method: true },
          },
        },
      },
    },
  });
}

function serializePublic(estimate: NonNullable<Awaited<ReturnType<typeof loadEstimate>>>) {
  return {
    token: estimate.publicToken,
    status: estimate.status,
    amountCents: estimate.amountCents,
    amountLabel: formatCents(estimate.amountCents),
    notes: estimate.notes,
    shopName: estimate.business.name,
    jobTitle: estimate.job?.title ?? "Service estimate",
    jobAddress: estimate.job?.address ?? null,
    sentAt: estimate.sentAt?.toISOString() ?? null,
    acceptedAt: estimate.acceptedAt?.toISOString() ?? null,
    invoice: estimate.invoice
      ? {
          id: estimate.invoice.id,
          status: estimate.invoice.status,
          amountCents: estimate.invoice.amountCents,
          paid: estimate.invoice.status === "paid",
        }
      : null,
    cardPayAvailable: isEstimateCardPayReady(estimate.business),
  };
}

export async function GET(request: Request, { params }: Params) {
  const limited = await publicTokenLimited(request, "estimate", "GET");
  if (limited) return limited;
  const { token } = await params;
  const estimate = await loadEstimate(token);
  if (!estimate?.publicToken) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }
  return NextResponse.json({ estimate: serializePublic(estimate) });
}

const actionSchema = z.object({
  action: z.enum(["accept", "pay_manual", "pay_card", "confirm_card"]),
  sessionId: z.string().min(1).optional(),
});

/**
 * Public customer actions — authorize by unguessable token only.
 * accept → mark accepted + create invoice if needed
 * pay_manual → customer attests cash/check/venmo; records payment
 * pay_card → Stripe Checkout as a direct charge on the shop's own account
 * confirm_card → verify Checkout session after redirect
 */
export async function POST(request: Request, { params }: Params) {
  const limited = await publicTokenLimited(request, "estimate", "POST");
  if (limited) return limited;
  const { token } = await params;
  const estimate = await loadEstimate(token);
  if (!estimate?.publicToken) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  try {
    const body = actionSchema.parse(await request.json());

    if (body.action === "accept") {
      if (!estimate.invoice) {
        await prisma.invoice.create({
          data: {
            businessId: estimate.businessId,
            estimateId: estimate.id,
            jobId: estimate.jobId,
            amountCents: estimate.amountCents,
            status: "open",
          },
        });
      }

      const updated = await prisma.estimate.update({
        where: { id: estimate.id },
        data: {
          status: "accepted",
          acceptedAt: estimate.acceptedAt ?? new Date(),
        },
        include: {
          business: { select: BUSINESS_SELECT },
          job: { select: { id: true, title: true, address: true } },
          invoice: {
            include: {
              payments: {
                select: { id: true, amountCents: true, status: true, method: true },
              },
            },
          },
        },
      });

      return NextResponse.json({ ok: true, estimate: serializePublic(updated) });
    }

    if (body.action === "confirm_card") {
      if (!body.sessionId) {
        return NextResponse.json({ error: "sessionId required" }, { status: 400 });
      }
      if (!isEstimateCardPayReady(estimate.business)) {
        return NextResponse.json({ error: "Card pay unavailable" }, { status: 503 });
      }
      const stripe = getStripe();
      /*
        The session was created on the shop's connected account, so a plain
        platform retrieve would report it as missing.
      */
      const session = await stripe.checkout.sessions.retrieve(body.sessionId, {
        stripeAccount: estimate.business.stripeConnectAccountId!,
      });
      if (session.metadata?.publicToken !== token) {
        return NextResponse.json({ error: "Session mismatch" }, { status: 400 });
      }
      await fulfillEstimateCheckoutSession(session);
      const fresh = await loadEstimate(token);
      return NextResponse.json({
        ok: true,
        estimate: fresh ? serializePublic(fresh) : null,
      });
    }

    if (body.action === "pay_card") {
      if (!isEstimateCardPayReady(estimate.business)) {
        return NextResponse.json(
          { error: "This shop is not set up to take cards yet" },
          { status: 503 },
        );
      }
      if (estimate.invoice?.status === "paid") {
        return NextResponse.json({
          ok: true,
          alreadyPaid: true,
          estimate: serializePublic(estimate),
        });
      }

      const invoiceId = await ensureInvoiceForEstimate(estimate);
      const session = await createEstimateCheckoutSession({
        estimateId: estimate.id,
        businessId: estimate.businessId,
        businessName: estimate.business.name,
        amountCents: estimate.amountCents,
        publicToken: estimate.publicToken,
        invoiceId,
        jobTitle: estimate.job?.title,
        business: estimate.business,
      });

      if (!session.url) {
        return NextResponse.json(
          { error: "Could not start card checkout" },
          { status: 502 },
        );
      }

      return NextResponse.json({ ok: true, checkoutUrl: session.url });
    }

    // pay_manual — customer attests payment outside card rails
    const invoiceId = await ensureInvoiceForEstimate(estimate);

    if (estimate.invoice?.status === "paid") {
      const fresh = await loadEstimate(token);
      return NextResponse.json({
        ok: true,
        alreadyPaid: true,
        estimate: fresh ? serializePublic(fresh) : null,
      });
    }

    await prisma.$transaction([
      prisma.payment.create({
        data: {
          businessId: estimate.businessId,
          invoiceId,
          amountCents: estimate.amountCents,
          status: "recorded",
          method: "customer_attested",
        },
      }),
      prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: "paid" },
      }),
    ]);

    const fresh = await loadEstimate(token);
    return NextResponse.json({
      ok: true,
      estimate: fresh ? serializePublic(fresh) : null,
    });
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
