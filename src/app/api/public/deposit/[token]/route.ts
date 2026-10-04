import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createDepositCheckoutSession,
  fulfillDepositCheckoutSession,
  getDepositByToken,
} from "@/lib/booking-deposit";
import { formatCentsExact } from "@/lib/money";
import { getStripe } from "@/lib/stripe";
import { getConnectStatus } from "@/lib/stripe-connect";
import { publicTokenLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };
type LoadedDeposit = NonNullable<Awaited<ReturnType<typeof getDepositByToken>>>;

function serializePublic(deposit: LoadedDeposit) {
  return {
    token: deposit.publicToken,
    status: deposit.status,
    amountCents: deposit.amountCents,
    /*
      To the cent. This label is on the button the customer presses, so it has
      to be the figure their card is actually charged — formatCents rounds, and
      would offer to charge "$50" for $49.50.
    */
    amountLabel: formatCentsExact(deposit.amountCents),
    shopName: deposit.business.name,
    shopPhone: deposit.business.phone,
    paid: deposit.status === "paid",
    cardPayAvailable: getConnectStatus(deposit.business).canAcceptPayments,
    paidAt: deposit.paidAt?.toISOString() ?? null,
  };
}

export async function GET(request: Request, { params }: Params) {
  const limited = await publicTokenLimited(request, "deposit", "GET");
  if (limited) return limited;
  const { token } = await params;
  const deposit = await getDepositByToken(token);
  if (!deposit?.publicToken) {
    return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
  }
  /*
    Whether this deposit is already paid, and whether the shop can take a card
    at all, both change without the customer doing anything. A cached body here
    shows someone a pay button for money they have already sent.
  */
  return NextResponse.json(
    { deposit: serializePublic(deposit) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const actionSchema = z.object({
  action: z.enum(["pay_card", "confirm_card"]),
  sessionId: z.string().min(1).optional(),
});

/**
 * Customer-facing deposit actions, authorized by unguessable token alone.
 *
 * There is no manual "I paid" path here on purpose. A deposit exists to hold
 * an appointment slot against a real commitment, and a self-attested deposit
 * commits nothing — the shop would be dispatching a truck at 2am on a
 * checkbox.
 */
export async function POST(request: Request, { params }: Params) {
  const limited = await publicTokenLimited(request, "deposit", "POST");
  if (limited) return limited;
  const { token } = await params;
  const deposit = await getDepositByToken(token);
  if (!deposit?.publicToken) {
    return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
  }

  const connect = getConnectStatus(deposit.business);

  try {
    const body = actionSchema.parse(await request.json());

    if (!connect.canAcceptPayments || !connect.accountId) {
      return NextResponse.json(
        { error: "This shop is not set up to take cards yet" },
        { status: 503 },
      );
    }

    if (body.action === "confirm_card") {
      if (!body.sessionId) {
        return NextResponse.json({ error: "sessionId required" }, { status: 400 });
      }
      /*
        Created as a direct charge, so it is only visible with the connected
        account option — a platform-scoped retrieve reports it missing.
      */
      const session = await getStripe().checkout.sessions.retrieve(
        body.sessionId,
        { stripeAccount: connect.accountId },
      );
      if (session.metadata?.publicToken !== token) {
        return NextResponse.json({ error: "Session mismatch" }, { status: 400 });
      }
      await fulfillDepositCheckoutSession(session);
      const fresh = await getDepositByToken(token);
      return NextResponse.json({
        ok: true,
        deposit: fresh ? serializePublic(fresh) : null,
      });
    }

    if (deposit.status === "paid") {
      return NextResponse.json({
        ok: true,
        alreadyPaid: true,
        deposit: serializePublic(deposit),
      });
    }

    const session = await createDepositCheckoutSession({
      deposit,
      business: deposit.business,
    });
    if (!session.url) {
      return NextResponse.json(
        { error: "Could not start card checkout" },
        { status: 502 },
      );
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
