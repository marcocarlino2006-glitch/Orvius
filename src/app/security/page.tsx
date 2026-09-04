import { LegalDocument, LegalSection } from "@/components/legal-document";
import { company } from "@/lib/company";
import { subprocessors } from "@/lib/subprocessors";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Security",
  description: `Security practices for ${company.productName}. No third-party audit certification claimed.`,
};

export default function SecurityPage() {
  return (
    <LegalDocument
      label="Trust"
      title="Security"
      description={`How ${company.legalName} protects ${company.productName} systems and data. This page describes practices — not a compliance certification.`}
      updated={company.legalUpdated}
    >
      <LegalSection title="1. Our posture">
        <p>
          We design {company.productName} for small and mid-size trade businesses that handle
          sensitive caller and job data. We take security seriously and continuously improve
          controls. <strong>We do not currently claim SOC 2, ISO 27001, HIPAA, PCI DSS Level 1,
          FedRAMP, or similar third-party certifications.</strong>{" "}
          Do not interpret marketing language as an audit attestation.
        </p>
      </LegalSection>

      <LegalSection title="2. Practices">
        <ul>
          <li>Encrypted connections (HTTPS/TLS) for web and API traffic</li>
          <li>Access controls on production systems and credentials</li>
          <li>Secrets stored outside application source code</li>
          <li>Webhook signature validation for telephony and billing providers where supported</li>
          <li>Vendor due diligence for hosting, telephony, voice AI, and payments</li>
        </ul>
        <p>No system is perfectly secure. We work to reduce risk and respond to incidents.</p>
      </LegalSection>

      <LegalSection title="3. Product controls you operate">
        <ul>
          <li>Business hours, services, and escalation contacts you configure</li>
          <li>Human review paths when confidence is low or data is incomplete</li>
          <li>Approve-before-send patterns for higher-risk outbound actions where enabled</li>
          <li>Audit trail of calls, transcripts, and key workspace actions</li>
        </ul>
        <p>
          You remain responsible for how the Service is deployed on your lines, including recording
          notices, AI disclosure, and SMS consent. See <Link href="/terms">Terms</Link> and{" "}
          <Link href="/sms-terms">SMS Terms</Link>.
        </p>
      </LegalSection>

      <LegalSection title="4. Data handling">
        <p>
          Call metadata, transcripts, lead records, and account data are stored to operate the
          Service (including via our database provider). See our{" "}
          <Link href="/privacy">Privacy Policy</Link> for controller/processor roles, categories,
          retention, state privacy rights, and deletion requests. We do not claim HIPAA readiness
          or offer a standard BAA unless expressly agreed in writing.
        </p>
      </LegalSection>

      <LegalSection title="5. Subprocessors">
        <ul>
          {subprocessors.map((s) => (
            <li key={s.name}>
              <strong>{s.name}</strong> — {s.purpose}
            </li>
          ))}
        </ul>
      </LegalSection>

      <LegalSection title="6. Customer compliance">
        <p>
          Business customers are responsible for laws applicable to their operations, including
          TCPA and similar messaging rules, call recording/AI notice requirements, advertising
          rules, and trade licensing. {company.productName} provides tools; customers control
          deployment.
        </p>
      </LegalSection>

      <LegalSection title="7. Incident reporting">
        <p>
          Report security concerns to {company.legalEmail}. We investigate good-faith reports. For
          confirmed personal-data breaches affecting Customer Content, we notify affected business
          customers without undue delay where legally required or when we determine notification is
          appropriate, and we cooperate with customer notification duties as processor.
        </p>
      </LegalSection>

      <LegalSection title="8. Contact">
        <p>
          {company.legalName}
          <br />
          {company.legalEmail}
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
