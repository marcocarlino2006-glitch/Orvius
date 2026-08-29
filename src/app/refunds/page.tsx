import { LegalDocument, LegalSection } from "@/components/legal-document";
import { company, pricing } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Refunds & Cancellation",
  description: `Refund and cancellation policy for ${company.productName} subscriptions.`,
};

export default function RefundsPage() {
  return (
    <LegalDocument
      label="Legal"
      title="Refunds & Cancellation"
      description={`How billing, pilots, and cancellations work for ${company.productName} operated by ${company.legalName}.`}
      updated={company.legalUpdated}
    >
      <LegalSection title="1. Pilot program">
        <p>
          Design-partner pilots are free for thirty (30) days unless otherwise
          agreed in writing. No credit card is required to start a pilot when
          offered. At the end of the pilot, you may subscribe to a paid plan or
          discontinue use.
        </p>
      </LegalSection>

      <LegalSection title="2. Paid subscriptions">
        <p>
          {company.productName} Pro is billed at ${pricing.pro.price}/month in
          advance through Stripe unless a custom agreement states otherwise.
          Subscriptions renew automatically each billing period until canceled.
        </p>
      </LegalSection>

      <LegalSection title="3. Cancellation">
        <p>
          You may cancel at any time by contacting {company.supportEmail} or
          through your Stripe customer portal when available. Cancellation takes
          effect at the end of the current billing period. You will retain
          access through the period you paid for.
        </p>
      </LegalSection>

      <LegalSection title="4. Refunds">
        <p>
          Monthly subscription fees are generally non-refundable except where
          required by law or at our sole discretion for billing errors or
          prolonged Service outages caused by us. If you believe you were charged
          in error, contact {company.supportEmail} within fourteen (14) days.
        </p>
      </LegalSection>

      <LegalSection title="5. Service suspension">
        <p>
          We may suspend the Service for non-payment, abuse, or material breach
          of our <Link href="/terms">Terms of Service</Link>. Outstanding fees
          remain due for usage before suspension.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
