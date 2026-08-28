import { LegalDocument, LegalSection } from "@/components/legal-document";
import { company } from "@/lib/company";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${company.legalName} collects, uses, and protects data through ${company.productName}.`,
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      label="Legal"
      title="Privacy Policy"
      description={`${company.legalName} (&quot;we&quot;) operates ${company.productName}. This policy explains how we handle information when you use our website and Service.`}
      updated="August 28, 2026"
    >
      <LegalSection title="1. Who we are">
        <p>
          The data controller for {company.productName} is {company.legalName}.
          Contact: {company.contactEmail}.
        </p>
      </LegalSection>

      <LegalSection title="2. Information we collect">
        <p>
          <strong>Business account data.</strong> Name, email, phone, business
          name, trade, service area, business hours, services offered, and phone
          numbers you connect to the Service.
        </p>
        <p>
          <strong>Call and message data.</strong> Inbound and outbound call
          metadata, recordings or transcripts where enabled, caller phone
          numbers, SMS content, AI-generated summaries, and lead fields (name,
          address, urgency, service type, notes).
        </p>
        <p>
          <strong>Website data.</strong> Pilot signup forms, waitlist entries,
          and standard server logs (IP address, browser type, pages visited).
        </p>
        <p>
          <strong>Payment data.</strong> Billing details are processed by our
          payment provider. We do not store full card numbers on our servers.
        </p>
      </LegalSection>

      <LegalSection title="3. How we use information">
        <ul>
          <li>Operate the AI receptionist and deliver owner alerts</li>
          <li>Display leads and call history in your dashboard</li>
          <li>Onboard, support, and improve the Service</li>
          <li>Send service-related emails and SMS (with your consent where required)</li>
          <li>Process payments and comply with legal obligations</li>
        </ul>
        <p>
          We do not sell personal information. We do not use caller data to
          train unrelated third-party models beyond what is necessary to operate
          the Service through our subprocessors.
        </p>
      </LegalSection>

      <LegalSection title="4. Subprocessors">
        <p>
          We use trusted infrastructure and communications providers to run{" "}
          {company.productName}, which may include cloud hosting, telephony
          carriers, voice AI platforms, and email delivery services. These
          providers process data on our instructions and under contractual
          safeguards.
        </p>
      </LegalSection>

      <LegalSection title="5. Retention">
        <p>
          We retain business and call data while your account is active and for
          a reasonable period afterward for backup, dispute resolution, and legal
          compliance. You may request deletion of your business account data by
          contacting {company.contactEmail}. Some logs may be retained where
          required by law.
        </p>
      </LegalSection>

      <LegalSection title="6. Security">
        <p>
          We use industry-standard measures to protect data in transit and at
          rest, including encrypted connections and access controls. No method
          of transmission over the Internet is 100% secure; we cannot guarantee
          absolute security.
        </p>
      </LegalSection>

      <LegalSection title="7. Your rights">
        <p>
          Depending on your location, you may have rights to access, correct,
          delete, or export personal information, or to object to certain
          processing. Contact {company.contactEmail} to exercise these rights.
          We will respond within a reasonable timeframe.
        </p>
      </LegalSection>

      <LegalSection title="8. Call recording and SMS">
        <p>
          Customers are responsible for providing any legally required notice to
          callers and texters about AI handling, recording, or monitoring in
          their jurisdiction. {company.productName} provides tools to capture and
          summarize conversations; you control how those tools are deployed on
          your lines.
        </p>
      </LegalSection>

      <LegalSection title="9. Children">
        <p>
          The Service is for businesses and is not directed to individuals under
          18. We do not knowingly collect data from children.
        </p>
      </LegalSection>

      <LegalSection title="10. Changes">
        <p>
          We may update this policy from time to time. Material changes will be
          posted on this page with an updated date. Continued use after changes
          constitutes acceptance.
        </p>
      </LegalSection>

      <LegalSection title="11. Contact">
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
