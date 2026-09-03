import { LegalDocument, LegalSection } from "@/components/legal-document";
import { company } from "@/lib/company";
import { subprocessors } from "@/lib/subprocessors";
import type { Metadata } from "next";
import Link from "next/link";

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
      updated={company.legalUpdated}
    >
      <LegalSection title="1. Who we are and roles">
        <p>
          Contact: {company.legalEmail}. For website and account data about business users,{" "}
          {company.legalName} is the controller. For caller and customer data collected on a
          customer&apos;s phone lines through the Service, the business customer is generally the
          controller and {company.legalName} acts as a processor / service provider processing that
          data on the customer&apos;s instructions to operate the Service.
        </p>
      </LegalSection>

      <LegalSection title="2. Information we collect">
        <p>
          <strong>Business account data.</strong> Name, email, phone, business name, trade, service
          area, hours, services, and numbers you connect.
        </p>
        <p>
          <strong>Call and message data.</strong> Call/SMS metadata, recordings or transcripts where
          enabled, caller numbers, message content, AI summaries, and lead fields (name, address,
          urgency, service type, notes).
        </p>
        <p>
          <strong>Website data.</strong> Forms, waitlist entries, and standard logs (IP, user agent,
          pages).
        </p>
        <p>
          <strong>Payment data.</strong> Processed by Stripe. We do not store full card numbers on
          our application servers.
        </p>
      </LegalSection>

      <LegalSection title="3. How we use information">
        <ul>
          <li>Operate the AI receptionist, workspace, and owner alerts</li>
          <li>Display calls, customers, jobs, and history in your dashboard</li>
          <li>Onboard, support, secure, and improve reliability of the Service</li>
          <li>Send transactional email/SMS related to the Service</li>
          <li>Process payments and comply with law</li>
        </ul>
        <p>
          We do not sell personal information. We do not share personal information for
          cross-context behavioral advertising. We do not use Customer Content to train unrelated
          third-party foundation models outside what is required to operate the Service through our
          subprocessors under their terms.
        </p>
      </LegalSection>

      <LegalSection title="4. Subprocessors">
        <p>
          We use infrastructure and communications providers to run {company.productName}. Current
          categories include:
        </p>
        <ul>
          {subprocessors.map((s) => (
            <li key={s.name}>
              <strong>{s.name}.</strong> {s.purpose}. Data: {s.data}.
            </li>
          ))}
        </ul>
        <p>
          Voice AI stacks may include additional model and speech providers engaged through our
          voice platform. We update this list as providers change.
        </p>
      </LegalSection>

      <LegalSection title="5. Retention">
        <p>
          We retain business and call data while your account is active and for a reasonable period
          afterward for backups, disputes, security, and legal compliance. Request deletion at{" "}
          {company.legalEmail}. Some records may be retained where required by law or for
          legitimate security purposes.
        </p>
      </LegalSection>

      <LegalSection title="6. Security">
        <p>
          We use industry-standard measures including TLS in transit and access controls. No method
          of transmission or storage is 100% secure. See our{" "}
          <Link href="/security">Security</Link> page. We do not claim SOC 2, ISO 27001, HIPAA, or
          similar certifications at this time.
        </p>
      </LegalSection>

      <LegalSection title="7. Your rights and requests">
        <p>
          Depending on your location, you may have rights to access, correct, delete, or export
          personal information, or to appeal a denial. Contact {company.legalEmail}. We may verify
          identity and respond within timelines required by applicable law (including up to 45 days
          where required, with permitted extensions).
        </p>
        <p>
          If you are a caller seeking deletion of data collected by a shop using {company.productName},
          we may direct you to that business as controller, and we will assist that business as
          required by our role as processor.
        </p>
      </LegalSection>

      <LegalSection title="8. Call recording and SMS">
        <p>
          Business customers are responsible for legally required notices to callers and texters
          about AI handling, recording, or monitoring. See <Link href="/sms-terms">SMS Terms</Link>{" "}
          and <Link href="/terms">Terms of Service</Link>.
        </p>
      </LegalSection>

      <LegalSection title="9. International processing">
        <p>
          The Service is operated primarily in the United States. If you access it from elsewhere,
          you understand information may be processed in the United States.
        </p>
      </LegalSection>

      <LegalSection title="10. Children">
        <p>
          The Service is for businesses and is not directed to individuals under 18. We do not
          knowingly collect data from children.
        </p>
      </LegalSection>

      <LegalSection title="11. Changes">
        <p>
          We may update this policy by posting a revised version with an updated date. Continued use
          after changes constitutes acceptance where permitted by law.
        </p>
      </LegalSection>

      <LegalSection title="12. Contact">
        <p>
          {company.legalName}
          <br />
          {company.legalEmail}
          <br />
          {company.domain}
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
