import { PAST_DUE_GRACE_DAYS, PAST_DUE_LINE_DAYS, PILOT_DAYS, PILOT_LINE_GRACE_DAYS } from "@/lib/billing-entitlement";
import { getPlatformFeeBps } from "@/lib/platform-fee";
import { OVERAGE_CENTS_PER_CALL, getPaidPlans } from "@/lib/pricing-plans";
import { MONEY_BACK_DAYS } from "@/lib/money-back";
import { PAUSE_ENDING_NOTICE_DAYS } from "@/lib/plan-exit";
import { LAUNCH_SCOPE_LINE } from "@/lib/trades";
import {
  CALLER_HOURLY_LIMIT,
  DEFAULT_ASK_DAILY_LIMIT,
  DEFAULT_SHOP_DAILY_CEILING,
  LINE_RETENTION_DAYS,
} from "@/lib/usage-limits";

/*
  The whole commercial offer in one place, built from the constants the product
  enforces. Pricing, Refunds and the FAQ render from here, so a limit cannot be
  changed in code and stay wrong on the site.
*/

export type TermRow = { id: string; label: string; detail: string };
export type TermGroup = { id: string; title: string; lead: string; rows: readonly TermRow[] };

const fmt = (n: number) => n.toLocaleString("en-US");
const allowances = () =>
  getPaidPlans()
    .map((p) => `${p.name} ${fmt(p.includedCalls ?? 0)}`)
    .join(", ");

export function platformFeePercentLabel(): string {
  const pct = getPlatformFeeBps() / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
}

export function commercialTerms(): readonly TermGroup[] {
  return [
    {
      id: "two-bills",
      title: "Two separate bills",
      lead: "What you pay Orvius and what your customers pay you never mix.",
      rows: [
        {
          id: "subscription",
          label: "Your Orvius plan",
          detail:
            "A flat monthly or yearly price, charged to your card through Stripe, plus tax where it applies. The only other charge is call overage, invoiced once after the month ends.",
        },
        {
          id: "customer-payments",
          label: "Your customers' payments",
          detail: `Deposits, invoices and service plans your customers pay by card go through your own Stripe account and settle to your bank. Stripe charges its standard processing, and Orvius takes ${platformFeePercentLabel()} of each card payment. Cash, checks and bank transfers you record by hand carry no fee.`,
        },
      ],
    },
    {
      id: "limits",
      title: "What's included, and what happens at each limit",
      lead: "Going past an allowance never stops the line. Only the runaway protection ends a call, and that call still shows in your log.",
      rows: [
        {
          id: "calls",
          label: "Answered calls",
          detail: `${allowances()} a month, reset on the 1st. Your own test calls, hang-ups under 15 seconds and calls you mark spam don't count. Past the allowance every call is still answered and each one is ${OVERAGE_CENTS_PER_CALL}¢, invoiced after the month ends. We text you at 80% and at 100%, and Billing shows the running count.`,
        },
        {
          id: "texts",
          label: "Texts",
          detail:
            "No separate count and no per-text charge. Booking confirmations, reminders, owner alerts and your replies from the business line are included. Texting customers from your own number needs a one-time carrier registration, which Orvius files for you at no cost.",
        },
        {
          id: "ask",
          label: "Ask",
          detail: `Up to ${fmt(DEFAULT_ASK_DAILY_LIMIT)} AI-worded answers a day per shop. Past that, Ask still answers from your shop's records, just without the AI wording, until the next day.`,
        },
        {
          id: "runaway",
          label: "Runaway protection",
          detail: `If one number calls more than ${CALLER_HOURLY_LIMIT} times in an hour, or your line takes more than ${fmt(DEFAULT_SHOP_DAILY_CEILING)} calls in a day, the caller is told the team will call back and the call ends. This stops robodialers and call loops from running up a bill. Calls from your own phone never count as repeats.`,
        },
      ],
    },
    {
      id: "terms",
      title: "Trial, cancellation and refunds",
      lead: "No contract on any plan.",
      rows: [
        {
          id: "trial",
          label: "Trial",
          detail: `Card signup starts the paid plan you pick. There is no free trial; instead your first ${MONEY_BACK_DAYS} days are money back (see Refunds). A guided Pilot, booked through a call audit, runs ${PILOT_DAYS} days at no charge with no card. When it ends, your line keeps answering for ${PILOT_LINE_GRACE_DAYS} more days while you decide.`,
        },
        {
          id: "cancel",
          label: "Cancel",
          detail: `Billing → Pause or cancel. You cancel on Stripe in a few taps. You keep everything until the end of the period you paid for. After that the line stops answering and your number is held for ${LINE_RETENTION_DAYS} days in case you come back. You can download all your records at any time, including after you cancel.`,
        },
        {
          id: "pause",
          label: "Pause",
          detail: `A monthly plan can pause for 1, 2 or 3 months in the slow season. The month you paid for runs out first. While paused there is no charge, the line is off, and your number, customers and settings are kept. We text you ${PAUSE_ENDING_NOTICE_DAYS} days before it switches back on by itself.`,
        },
        {
          id: "refunds",
          label: "Refunds",
          detail: `First ${MONEY_BACK_DAYS} days on your first plan: if it isn't working for your shop, Billing → Cancel and refund cancels the plan and returns every payment made so far, with no call and no questions. Once per shop. After that, plans aren't refunded for unused time. If we charged you in error, or an outage on our side cost you calls, email us within 14 days of the charge and we'll refund it.`,
        },
        {
          id: "late",
          label: "A failed payment",
          detail: `Stripe retries the card. You keep the full workspace for ${PAST_DUE_GRACE_DAYS} days and the line keeps answering for ${PAST_DUE_LINE_DAYS} days, so a lost card never costs you a call on day one.`,
        },
      ],
    },
    {
      id: "supported",
      title: "What it works with",
      lead: "Supported today. If it isn't on this list, we don't claim it.",
      rows: [
        { id: "trades", label: "Trades", detail: `${LAUNCH_SCOPE_LINE}, for residential service and repair. The exact jobs, and what goes to you instead, are listed at orvius.im/trades.` },
        {
          id: "phones",
          label: "Phone",
          detail:
            "Keep your number. Forward it from any carrier, desk phone or cell, or answer on the Orvius line we give you. Moving your number to Orvius is optional.",
        },
        {
          id: "integrations",
          label: "Integrations",
          detail:
            "Stripe for customer payments. Jobber, which receives new requests from your calls. A calendar feed for Google, Apple or Outlook. Text and email alerts to you.",
        },
      ],
    },
  ];
}
