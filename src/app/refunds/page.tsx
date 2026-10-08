import { LegalDocument, LegalSection } from "@/components/legal-document";
import { PAST_DUE_GRACE_DAYS, PAST_DUE_LINE_DAYS } from "@/lib/billing-entitlement";
import { company } from "@/lib/company";
import { LINE_RETENTION_DAYS } from "@/lib/usage-limits";
import { OVERAGE_CENTS_PER_CALL, annualChargeDollars, getPaidPlans, getPlanById } from "@/lib/pricing-plans";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Refunds & Cancellation",
  description: `Refund and cancellation policy for ${company.productName} subscriptions.`,
};

export default function RefundsPage() {
  const paid = getPaidPlans();
  const multi = getPlanById("multi");

  return (
    <LegalDocument
      label="Legal"
      title="Refunds & Cancellation"
      description={`How billing, pilots, and cancellations work for ${company.productName} operated by ${company.legalName}.`}
      updated={company.legalUpdated}
    >
      <LegalSection title="1. Pilot program">
        <p>
          When we offer a pilot, it runs at no charge for thirty (30) days unless otherwise agreed in
          writing, and no credit card is required to start it. At the end of the pilot, you
          may subscribe to a paid plan or discontinue use. Pilot credits (if any) are governed by
          the applicable pilot agreement or order form.
        </p>
      </LegalSection>

      <LegalSection title="2. Paid subscriptions">
        <p>
          Published monthly list prices (subject to change with notice as described in the{" "}
          <Link href="/terms">Terms of Service</Link>):
        </p>
        <ul>
          {paid.map((plan) => (
            <li key={plan.id}>
              <strong>{plan.name}</strong> — ${plan.price}/month
              {plan.annualPrice != null
                ? `, or $${annualChargeDollars(plan).toLocaleString("en-US")}/year billed annually`
                : ""}
              , including {(plan.includedCalls ?? 0).toLocaleString("en-US")} answered calls a month.
            </li>
          ))}
          <li>
            <strong>{multi.name}</strong> — ${multi.price} per location a month for{" "}
            {multi.limit?.toLowerCase()}, set up on an order form.
          </li>
        </ul>
        <p>
          Answered calls past a plan&apos;s monthly allowance are {OVERAGE_CENTS_PER_CALL}¢ each, invoiced
          after the calendar month ends. Charges are processed by Stripe. Subscriptions renew
          automatically each billing period until canceled. You are responsible for applicable taxes.
        </p>
      </LegalSection>

      <LegalSection title="3. Cancellation">
        <p>
          You may cancel at any time from Settings → Billing → Manage, which opens your Stripe
          customer portal, or by emailing {company.supportEmail}. Cancellation stops future renewals;
          access continues through the end of the paid period. After that your Orvius line stops
          answering, and your number is held for {LINE_RETENTION_DAYS} days in case you return. You can
          download your shop data at any time, including after cancellation.
        </p>
      </LegalSection>

      <LegalSection title="4. Refunds">
        <p>
          Plans are not refunded for unused time, except where required by law or where we agree in
          writing. If we charged you in error, or an outage caused by us cost you calls, contact{" "}
          {company.supportEmail} within fourteen (14) days of the charge and we will refund it.
        </p>
        <p>
          If a payment fails, Stripe retries the card. You keep the full workspace for{" "}
          {PAST_DUE_GRACE_DAYS} days and your line keeps answering for {PAST_DUE_LINE_DAYS} days.
        </p>
      </LegalSection>

      <LegalSection title="5. Chargebacks & suspension">
        <p>
          Contact support before initiating a chargeback so we can resolve billing issues. We may
          suspend the Service for non-payment, abuse, or material breach of our{" "}
          <Link href="/terms">Terms of Service</Link>. Outstanding fees remain due for usage before
          suspension. Unresolved disputes are subject to the dispute-resolution terms in the Terms.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
