import { NextResponse } from "next/server";
import { financingFor, financingLine } from "@/lib/financing";
import {
  createEstimateCheckoutSession,
  ensureInvoiceForEstimate,
  fulfillEstimateCheckoutSession,
  isEstimateCardPayReady,
} from "@/lib/estimate-pay";
import { acceptEstimate } from "@/lib/estimate-choice";
import { findOption, parseEstimateOptions } from "@/lib/estimate-options";
import { formatCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { z } from "zod";
import { publicTokenLimited } from "@/lib/rate-limit";
import { enqueueOwnerAlert } from "@/lib/notification-queue";
import { recordCustomerClaim } from "@/lib/payment-record";

type Params = { params: Promise<{ token: string }> };

/** Card pay is a direct charge, so the shop's Connect state has to come along. */
const BUSINESS_SELECT = {
  id: true,
  name: true,
  stripeConnectAccountId: true,
  stripeConnectChargesEnabled: true,
  stripeConnectPayoutsEnabled: true,
  stripeConnectDetailsSubmitted: true,
  financingEnabled: true,
  financingMethods: true,
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
  const options = parseEstimateOptions(estimate.optionsJson);
  return {
    options: options.map((o) => ({ ...o, amountLabel: formatCents(o.amountCents) })),
    chosenOption: findOption(options, estimate.chosenOption)?.key ?? null,
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
          claimed: estimate.invoice.status !== "paid" && estimate.invoice.payments.some((p) => p.status === "claimed"),
        }
      : null,
    cardPayAvailable: isEstimateCardPayReady(estimate.business),
    financing: isEstimateCardPayReady(estimate.business) ? financingLine(financingFor(estimate.business, estimate.amountCents)) : null,
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
  option: z.string().max(20).optional(),
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
      const result = await acceptEstimate({
        estimateId: estimate.id,
        optionKey: body.option,
        by: "customer",
        actor: "customer",
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      const updated = await loadEstimate(token);
      return NextResponse.json({ ok: true, estimate: updated ? serializePublic(updated) : null });
    }

    if (
      (body.action === "pay_card" || body.action === "pay_manual") &&
      parseEstimateOptions(estimate.optionsJson).length &&
      !estimate.chosenOption
    ) {
      return NextResponse.json({ error: "Pick one of the options first." }, { status: 400 });
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

    const claim = await recordCustomerClaim({
      businessId: estimate.businessId,
      invoiceId,
      amountCents: estimate.amountCents,
      jobId: estimate.job?.id ?? null,
    });
    if (claim.created) {
      const shop = await prisma.business.findUnique({
        where: { id: estimate.businessId },
        select: { name: true, ownerPhone: true, ownerEmail: true },
      });
      if (shop) {
        await enqueueOwnerAlert({
          businessId: estimate.businessId,
          businessName: shop.name,
          ownerPhone: shop.ownerPhone,
          ownerEmail: shop.ownerEmail,
          dedupeKey: `payment-claimed:${invoiceId}`,
          message: `Orvius: a customer says they paid ${formatCents(estimate.amountCents)} for ${estimate.job?.title ?? "an estimate"} outside card checkout. It isn't counted as collected until you confirm it on the job.`,
        }).catch(() => undefined);
      }
    }

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
