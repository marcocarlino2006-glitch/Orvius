import { LegalDocument, LegalSection } from "@/components/legal-document";
import { company, pricing } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `Terms of Service for ${company.productName}, a product of ${company.legalName}.`,
};

export default function TermsPage() {
  return (
    <LegalDocument
      label="Legal"
      title="Terms of Service"
      description={`These terms govern your use of ${company.productName}, an AI receptionist service operated by ${company.legalName}.`}
      updated="August 28, 2026"
    >
      <LegalSection title="1. Agreement">
        <p>
          By accessing {company.domain}, applying for a pilot, or using{" "}
          {company.productName} (the &quot;Service&quot;), you agree to these
          Terms of Service (&quot;Terms&quot;) with {company.legalName} (
          &quot;Company,&quot; &quot;we,&quot; &quot;us&quot;). If you are
          accepting on behalf of a business, you represent that you have
          authority to bind that business.
        </p>
      </LegalSection>

      <LegalSection title="2. The Service">
        <p>
          {company.productName} provides AI-powered call and text handling for
          home-service businesses, including lead qualification, summaries, owner
          notifications, and a web dashboard. The Service is designed for{" "}
          {company.trades.join(", ")}, and related trades we approve during
          onboarding.
        </p>
        <p>
          We improve the Service continuously. Features, voice providers, and
          integrations may change. We will use reasonable efforts to avoid
          disrupting live operations.
        </p>
      </LegalSection>

      <LegalSection title="3. Pilot program">
        <p>
          Eligible businesses may join a limited design-partner pilot at no
          charge for thirty (30) days, subject to availability. Pilot
          participants receive onboarding support and access to core Service
          features described on our{" "}
          <Link href="/pricing">pricing page</Link>.
        </p>
        <p>
          At the end of the pilot, continued use requires enrollment in a paid
          plan (currently {company.productName} Pro at ${pricing.pro.price}/
          month, unless otherwise agreed in writing). We will notify you before
          any charge begins.
        </p>
      </LegalSection>

      <LegalSection title="4. Your responsibilities">
        <ul>
          <li>
            Provide accurate business information, hours, services, and owner
            contact details.
          </li>
          <li>
            Ensure you have the right to forward or provision phone numbers used
            with the Service.
          </li>
          <li>
            Comply with applicable laws regarding call recording, telemarketing,
            SMS consent, and customer notification in your jurisdiction.
          </li>
          <li>
            Review AI-generated summaries and lead data before relying on them
            for dispatch, pricing, or safety-critical decisions.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Fees and payment">
        <p>
          Paid plans are billed monthly in advance by {company.legalName}.
          Fees are non-refundable except where required by law or explicitly
          stated in a signed agreement. You authorize us to charge your payment
          method on file for recurring subscription fees.
        </p>
        <p>
          Failure to pay may result in suspension of the Service. You remain
          responsible for charges incurred before suspension.
        </p>
      </LegalSection>

      <LegalSection title="6. Acceptable use">
        <p>You may not use the Service to:</p>
        <ul>
          <li>Violate law or third-party rights</li>
          <li>Transmit unlawful, harassing, or fraudulent content</li>
          <li>Attempt to reverse-engineer, scrape, or overload our systems</li>
          <li>Misrepresent your identity or business to callers</li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Third-party providers">
        <p>
          The Service relies on third-party telecommunications and AI providers
          (including carriers, voice platforms, and cloud infrastructure). Their
          outages or policy changes may affect availability. We are not liable
          for failures caused solely by third parties outside our reasonable
          control.
        </p>
      </LegalSection>

      <LegalSection title="8. Disclaimer">
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS.&quot; WE DISCLAIM ALL WARRANTIES,
          EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A
          PARTICULAR PURPOSE, AND NON-INFRINGEMENT. AI responses may be
          incomplete or inaccurate. You use the Service at your own risk.
        </p>
      </LegalSection>

      <LegalSection title="9. Limitation of liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, {company.legalName.toUpperCase()}{" "}
          AND ITS FOUNDERS, OFFICERS, AND CONTRACTORS WILL NOT BE LIABLE FOR ANY
          INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR
          ANY LOSS OF PROFITS, REVENUE, DATA, OR GOODWILL, ARISING FROM YOUR USE
          OF THE SERVICE.
        </p>
        <p>
          OUR TOTAL LIABILITY FOR ANY CLAIM RELATING TO THE SERVICE IS LIMITED
          TO THE AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS BEFORE THE
          CLAIM, OR ONE HUNDRED DOLLARS ($100), WHICHEVER IS GREATER.
        </p>
      </LegalSection>

      <LegalSection title="10. Termination">
        <p>
          You may cancel at any time by contacting {company.contactEmail}.
          We may suspend or terminate access for material breach, non-payment,
          or abuse. Upon termination, your right to use the Service ends;
          provisions that by nature should survive (payment obligations,
          disclaimers, liability limits) will survive.
        </p>
      </LegalSection>

      <LegalSection title="11. Governing law">
        <p>
          These Terms are governed by the laws of {company.jurisdictionNote},
          without regard to conflict-of-law rules. Disputes will be resolved in
          the courts of that jurisdiction, unless otherwise required by
          applicable consumer protection law.
        </p>
      </LegalSection>

      <LegalSection title="12. Contact">
        <p>
          {company.legalName}
          <br />
          {company.contactEmail}
          <br />
          {company.domain}
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
