import { LegalDocument, LegalSection } from "@/components/legal-document";
import { company } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Security & Compliance",
  description: `Security practices and compliance guidance for ${company.productName}.`,
};

export default function SecurityPage() {
  return (
    <LegalDocument
      label="Legal"
      title="Security & Compliance"
      description={`How ${company.legalName} protects ${company.productName} data and supports customer compliance obligations.`}
      updated={company.legalUpdated}
    >
      <LegalSection title="1. Security practices">
        <ul>
          <li>Encrypted connections (HTTPS/TLS) for web and API traffic</li>
          <li>Access controls on production systems and credentials</li>
          <li>Environment secrets stored outside application code</li>
          <li>Vendor due diligence for telephony, voice AI, and payment partners</li>
        </ul>
        <p>
          No system is perfectly secure. We work to reduce risk and respond to
          incidents affecting customer data.
        </p>
      </LegalSection>

      <LegalSection title="2. Data handling">
        <p>
          Call metadata, transcripts, lead records, and account data are stored
          to operate the Service. See our{" "}
          <Link href="/privacy">Privacy Policy</Link> for retention and deletion
          requests.
        </p>
      </LegalSection>

      <LegalSection title="3. Customer compliance">
        <p>
          Business customers are responsible for compliance with laws applicable
          to their operations, including but not limited to:
        </p>
        <ul>
          <li>Telemarketing and SMS consent (TCPA and similar laws)</li>
          <li>Call recording and notification requirements</li>
          <li>Truth-in-advertising and trade licensing disclosures</li>
        </ul>
        <p>
          {company.productName} provides tools; customers control how those
          tools are deployed on their lines. See{" "}
          <Link href="/sms-terms">SMS Terms</Link> for text-message program
          details.
        </p>
      </LegalSection>

      <LegalSection title="4. Incident reporting">
        <p>
          Report security concerns to {company.legalEmail}. We investigate
          good-faith reports and will contact affected customers when required.
        </p>
      </LegalSection>

      <LegalSection title="5. Subprocessors">
        <p>
          The Service uses infrastructure and communications providers (cloud
          hosting, carriers, voice AI, payments). These vendors process data on
          our instructions under contractual safeguards.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
