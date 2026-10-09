import { LegalDocument, LegalSection } from "@/components/legal-document";
import { company } from "@/lib/company";
import { subprocessors } from "@/lib/subprocessors";
import {
  CALL_CONTENT_RETENTION_MONTHS,
  OWNER_NOTIFICATION_RETENTION_DAYS,
  WEBHOOK_EVENT_RETENTION_DAYS,
} from "@/lib/usage-limits";
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
        <p>Each of these is enforced in code, and the ones marked checked run as automated tests on every release.</p>
        <ul>
          <li>
            <strong>One shop never sees another&apos;s records (checked).</strong> Every signed-in request is tied to
            the shop it belongs to, and every record opened by id is looked up inside that shop. A release fails if any
            API route doesn&apos;t check who is asking.
          </li>
          <li>
            <strong>Roles (checked).</strong> Owner, manager and dispatcher each see only what their role allows.
            Technicians get a private link per person, not a sign-in, and sending a new link retires the old one.
          </li>
          <li>
            <strong>Credentials.</strong> Connected-app tokens (Jobber, QuickBooks) are encrypted before they are stored.
            Passwords are stored only as salted hashes. Provider keys live outside the source code.
          </li>
          <li>
            <strong>Signed webhooks.</strong> Calls, texts, payments and Jobber updates are accepted only with a valid
            provider signature or shared secret.
          </li>
          <li>
            <strong>Activity log.</strong> Settings → Activity log records what Orvius did on each call and what your
            team changed, with who and when, and downloads as CSV.
          </li>
          <li>
            <strong>Retention.</strong> Call recordings, transcripts and voicemail are deleted{" "}
            {CALL_CONTENT_RETENTION_MONTHS} months after the call. Provider delivery logs are pruned after{" "}
            {WEBHOOK_EVENT_RETENTION_DAYS} days and alert history after {OWNER_NOTIFICATION_RETENTION_DAYS} days.
          </li>
          <li>
            <strong>Recording notice.</strong> Every call opens by telling the caller it may be recorded and is
            answered by an automated receptionist.
          </li>
          <li>Encrypted connections (HTTPS/TLS) for all web and API traffic.</li>
        </ul>
        <p>No system is perfectly secure. We work to reduce risk and respond to incidents.</p>
      </LegalSection>

      <LegalSection title="3. Product controls you operate">
        <ul>
          <li>Business hours, services, and escalation contacts you configure</li>
          <li>Whether Orvius books callers itself or only takes the request for you to schedule</li>
          <li>
            Approvals: anything typed into Command is shown as a plan you approve, and jobs where two people fit equally
            wait for you. Emergencies and danger calls always come to you
          </li>
          <li>Settings → Receptionist lists what Orvius does on its own, what waits for you, and what it never does</li>
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

      <LegalSection title="7. Incidents">
        <p>
          If the voice AI can&apos;t be reached, your line doesn&apos;t go silent: it rings your handoff number, or
          your own mobile, then takes a message and texts you. Live provider status is on the{" "}
          <Link href="/status">status page</Link>.
        </p>
        <p>
          When something on our side stops calls, texts or alerts from working, we email the affected shops with what
          happened, what it affected and what we changed, and we refund billing affected by an outage we caused.
        </p>
        <p>
          Report security concerns to {company.legalEmail}. We investigate good-faith reports. For confirmed
          personal-data breaches affecting Customer Content, we notify affected business customers without undue delay
          where legally required or when we determine notification is appropriate, and we cooperate with customer
          notification duties as processor.
        </p>
      </LegalSection>

      <LegalSection title="8. Leaving">
        <p>
          You can download all of your shop&apos;s records at any time, including after you cancel. If you forwarded
          your number, it never left your carrier: turn forwarding off and calls ring as before. If you moved your
          number to Orvius, email {company.supportEmail} and we give your new carrier what it needs to move it again.
          We don&apos;t hold a number back. See <Link href="/help/leaving-orvius">Leaving Orvius</Link>.
        </p>
      </LegalSection>

      <LegalSection title="9. Contact">
        <p>
          {company.legalName}
          <br />
          {company.legalEmail}
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
