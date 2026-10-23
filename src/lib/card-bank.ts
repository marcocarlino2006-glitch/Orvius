import { isConnectConfigured } from "@/lib/stripe-connect";
import { getStripe } from "@/lib/stripe";
import type { BankArrival } from "@/lib/payment-math";

/**
 * A card on a connected account. The session id is what the payment row
 * stores (`stripe:cs_…`). Anything else was recorded in the shop.
 */
const SESSION = /^stripe:(cs_[A-Za-z0-9_]+)$/;

export function stripeSessionId(method: string | null | undefined): string | null {
  return SESSION.exec(method ?? "")?.[1] ?? null;
}

export type ChargeBalance = {
  chargeId: string;
  /** Unix seconds, when Stripe makes the funds available. */
  availableOn: number | null;
  status: "pending" | "available" | null;
};

export type PaidPayout = {
  /** Unix seconds. Stripe's arrival date for a payout that already paid. */
  arrivalDate: number;
  chargeIds: string[];
};

export type CardBankFacts = {
  inBankOn: number | null;
  paysOutOn: number | null;
  waitingOnPayout: boolean;
};

/**
 * Turn a charge and the recent paid payouts into a fact. Pending never says
 * the money arrived. A charge that is inside a paid payout did. Available
 * funds that are not in those payouts are waiting on the next one.
 */
export function cardBankFacts(charge: ChargeBalance, payouts: PaidPayout[]): CardBankFacts | null {
  if (!charge.chargeId) return null;
  if (charge.status === "pending") {
    return { inBankOn: null, paysOutOn: charge.availableOn, waitingOnPayout: false };
  }
  const hit = payouts.find((payout) => payout.chargeIds.includes(charge.chargeId));
  if (hit) return { inBankOn: hit.arrivalDate, paysOutOn: null, waitingOnPayout: false };
  if (charge.status === "available") return { inBankOn: null, paysOutOn: null, waitingOnPayout: true };
  return null;
}

/** Stripe dates are calendar days in UTC. Formatting in a local zone shifts them. */
export function bankDay(unix: number, now = new Date()): string {
  const at = new Date(unix * 1000);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
    ...(at.getUTCFullYear() === now.getUTCFullYear() ? {} : { year: "numeric" }),
  });
}

function asId(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && "id" in value && typeof (value as { id: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return null;
}

/** The expanded Checkout session, down to the charge and its balance transaction. */
export function chargeFromSession(session: unknown): ChargeBalance | null {
  if (!session || typeof session !== "object") return null;
  const paymentIntent = (session as { payment_intent?: unknown }).payment_intent;
  if (!paymentIntent || typeof paymentIntent !== "object") return null;
  const charge = (paymentIntent as { latest_charge?: unknown }).latest_charge;
  if (!charge || typeof charge !== "object") return null;
  const chargeId = asId(charge);
  if (!chargeId?.startsWith("ch_")) return null;
  const balance = (charge as { balance_transaction?: unknown }).balance_transaction;
  if (!balance || typeof balance !== "object") return { chargeId, availableOn: null, status: null };
  const availableOn = (balance as { available_on?: unknown }).available_on;
  const status = (balance as { status?: unknown }).status;
  return {
    chargeId,
    availableOn: typeof availableOn === "number" ? availableOn : null,
    status: status === "pending" || status === "available" ? status : null,
  };
}

function toArrival(facts: CardBankFacts, now: Date): BankArrival | null {
  const inBankOn = facts.inBankOn ? bankDay(facts.inBankOn, now) : null;
  const paysOutOn = facts.paysOutOn ? bankDay(facts.paysOutOn, now) : null;
  if (!inBankOn && !paysOutOn && !facts.waitingOnPayout) return null;
  return { inBankOn, paysOutOn, waitingOnPayout: facts.waitingOnPayout };
}

/**
 * Read one card payment's payout from the shop's connected account. Stops at
 * the first paid payout that contains the charge. Returns null when Stripe
 * is not configured, the payment was not a Checkout session, or the read fails.
 */
export async function cardBankForMethods(params: {
  methods: Array<string | null | undefined>;
  stripeAccount: string;
  now?: Date;
}): Promise<BankArrival | null> {
  const sessionId = params.methods.map(stripeSessionId).find((id): id is string => Boolean(id));
  if (!sessionId || !params.stripeAccount || !isConnectConfigured()) return null;
  const now = params.now ?? new Date();
  try {
    const stripe = getStripe();
    const onAccount = { stripeAccount: params.stripeAccount };
    const session = await stripe.checkout.sessions.retrieve(
      sessionId,
      { expand: ["payment_intent.latest_charge.balance_transaction"] },
      onAccount,
    );
    const charge = chargeFromSession(session);
    if (!charge) return null;
    const payouts: PaidPayout[] = [];
    if (charge.status !== "pending") {
      const listed = await stripe.payouts.list({ limit: 5, status: "paid" }, onAccount);
      for (const payout of listed.data) {
        const txns = await stripe.balanceTransactions.list({ payout: payout.id, type: "charge", limit: 100 }, onAccount);
        const chargeIds = txns.data
          .map((txn) => (typeof txn.source === "string" ? txn.source : txn.source?.id))
          .filter((id): id is string => Boolean(id));
        payouts.push({ arrivalDate: payout.arrival_date, chargeIds });
        if (chargeIds.includes(charge.chargeId)) break;
      }
    }
    const facts = cardBankFacts(charge, payouts);
    return facts ? toArrival(facts, now) : null;
  } catch {
    return null;
  }
}
