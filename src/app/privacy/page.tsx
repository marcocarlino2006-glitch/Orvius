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
      description={`${company.legalName} (&quot;we,&quot; &quot;us,&quot; or &quot;Company&quot;) operates ${company.productName}. This policy explains how we handle information when you use our website and Service. It is designed for U.S. trade businesses and includes California/state privacy disclosures.`}
      updated={company.legalUpdated}
    >
      <LegalSection title="1. Scope and roles">
        <p>
          This Privacy Policy applies to {company.domain}, related marketing pages, account
          signup, and the {company.productName} Service operated by {company.legalName}.
        </p>
        <p>
          <strong>Business users (controllers for their shop data).</strong> For information about
          shop owners, staff accounts, and billing contacts, {company.legalName} is generally the
          controller (or &quot;business&quot; under U.S. state privacy laws).
        </p>
        <p>
          <strong>Caller / end-customer data (customer is controller).</strong> When a business
          customer connects phone lines or messaging to {company.productName}, that business is
          generally the controller of caller and end-customer personal information.{" "}
          {company.legalName} acts as a <strong>processor / service provider</strong> — we process
          that data only to provide, secure, and support the Service on the customer&apos;s
          instructions, and as otherwise described in this policy and our{" "}
          <Link href="/terms">Terms of Service</Link>.
        </p>
        <p>
          Contact for privacy requests: {company.legalEmail}.
        </p>
      </LegalSection>

      <LegalSection title="2. Categories of information we collect">
        <p>
          <strong>A. Business account and profile data.</strong> Name, email, phone, business name,
          trade, service area, hours, services offered, escalation contacts, plan/billing status,
          and numbers you connect or provision.
        </p>
        <p>
          <strong>B. Authentication data.</strong> Sign-in identifiers via Google OAuth (name,
          email, provider subject id) and session/security cookies as described in our{" "}
          <Link href="/cookies">Cookie Policy</Link>.
        </p>
        <p>
          <strong>C. Call, SMS, and messaging data.</strong> Call and SMS metadata (timestamps,
          duration, direction, status), phone numbers, message content, recordings or transcripts
          where enabled, AI summaries, urgency labels, and lead fields (name, address, urgency,
          service type, notes).
        </p>
        <p>
          <strong>D. Workspace / operations data.</strong> Customers, jobs, dispatch assignments,
          estimates, invoices, payment records you enter, technician contacts, and related audit
          history created in the product.
        </p>
        <p>
          <strong>E. Website and support data.</strong> Forms, waitlist or pilot applications,
          support emails, and standard technical logs (IP address, user agent, pages, approximate
          timestamps, error diagnostics).
        </p>
        <p>
          <strong>F. Payment data.</strong> Processed by Stripe. We receive billing contact details
          and payment status tokens. We do not store full card numbers on our application servers.
        </p>
        <p>
          <strong>Sensitive / special categories.</strong> We do not intentionally collect
          government ID numbers, precise geolocation for advertising, biometric templates for
          identification, or health information regulated as protected health information (PHI)
          under HIPAA. Callers may volunteer sensitive details in free-form speech or text; if that
          happens, it is processed as Customer Content to operate the Service for the shop, not to
          build consumer profiles for sale. {company.productName} is{" "}
          <strong>not a HIPAA-covered product</strong> and is not intended for covered entities
          needing a BAA unless we expressly agree in a signed writing.
        </p>
      </LegalSection>

      <LegalSection title="3. Sources of information">
        <ul>
          <li>Directly from you (signup, settings, forms, support)</li>
          <li>From your connected lines and messaging (callers, SMS, voice AI stack)</li>
          <li>From your authorized users and technicians</li>
          <li>From payment and identity providers (Stripe, Google)</li>
          <li>Automatically from browsers and devices (logs, essential cookies)</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. How we use information">
        <p>We use information to:</p>
        <ul>
          <li>Operate the AI receptionist, workspace, owner alerts, and related product features</li>
          <li>Display calls, customers, jobs, money tools, and history in your dashboard</li>
          <li>Authenticate users, secure accounts, prevent abuse, and debug reliability issues</li>
          <li>Onboard, support, and communicate about the Service (transactional email/SMS)</li>
          <li>Process subscriptions and comply with law, lawful requests, and enforcement of Terms</li>
          <li>
            Improve Service reliability and quality for your account (for example, fixing failures,
            tuning prompts under your configuration) — not to sell data
          </li>
        </ul>
        <p>
          <strong>No sale / no ads sharing.</strong> We do not sell personal information. We do not
          share personal information for cross-context behavioral advertising. We do not use
          Customer Content to train unrelated third-party foundation models outside what is required
          to operate the Service through our subprocessors under their terms and our configuration.
        </p>
        <p>
          <strong>Automated processing.</strong> The Service uses automated systems (including
          voice AI and summarization) to handle calls/texts and generate workspace records. These
          outputs can be wrong or incomplete. Business customers must review material outputs before
          high-risk decisions. See <Link href="/terms">Terms</Link> §9.
        </p>
      </LegalSection>

      <LegalSection title="5. How we disclose information">
        <p>We disclose personal information only as needed for:</p>
        <ul>
          <li>
            <strong>Service providers / subprocessors</strong> who process data for us under
            contract (hosting, database, telephony, voice AI, payments, auth) — see §6
          </li>
          <li>
            <strong>Your organization</strong> — account admins and authorized users see Customer
            Content for their shop
          </li>
          <li>
            <strong>Legal and safety</strong> — to comply with law, lawful process, or to protect
            rights, safety, and integrity of the Service, users, or the public
          </li>
          <li>
            <strong>Business transfers</strong> — in connection with a merger, financing,
            acquisition, or asset sale, subject to appropriate confidentiality
          </li>
          <li>
            <strong>With your direction</strong> — integrations or exports you initiate
          </li>
        </ul>
        <p>
          We do not disclose personal information to data brokers for their independent marketing
          use.
        </p>
      </LegalSection>

      <LegalSection title="6. Subprocessors">
        <p>
          We use infrastructure and communications providers to run {company.productName}. Current
          named processors include:
        </p>
        <ul>
          {subprocessors.map((s) => (
            <li key={s.name}>
              <strong>{s.name}.</strong> {s.purpose}. Data: {s.data}.
            </li>
          ))}
        </ul>
        <p>
          Voice AI stacks may include additional speech-to-text, text-to-speech, and model providers
          engaged through our voice platform. Those nested providers process call audio/transcripts
          as needed to complete a session. We update this list as primary providers change. See also{" "}
          <Link href="/security">Security</Link>.
        </p>
      </LegalSection>

      <LegalSection title="7. Processor terms (Customer Content)">
        <p>
          When we process caller/end-customer personal information as a processor / service
          provider for a business customer, we will:
        </p>
        <ul>
          <li>Process Customer Content only to provide and secure the Service and as instructed by the customer (including configuration in-product)</li>
          <li>Require subprocessors to protect Customer Content with appropriate contractual and technical measures</li>
          <li>Assist with reasonable deletion, access, and correction requests the customer must fulfill as controller</li>
          <li>Notify the customer of a confirmed personal-data breach affecting their Customer Content without undue delay where legally required</li>
          <li>Upon account termination, cease active processing and delete or return Customer Content within a commercially reasonable period, except for backups, legal holds, security logs, or records we must retain by law</li>
        </ul>
        <p>
          Business customers are responsible for providing legally required notices to callers and
          texters, obtaining SMS/consent where required, and configuring recording/AI disclosures
          for jurisdictions they serve. See <Link href="/sms-terms">SMS Terms</Link> and{" "}
          <Link href="/terms">Terms</Link>.
        </p>
      </LegalSection>

      <LegalSection title="8. Retention">
        <p>
          We retain business and call-related data while your account is active and for a
          reasonable period afterward for backups, disputes, security, fraud prevention, and legal
          compliance. Retention windows vary by data type (for example, security logs may outlast
          marketing waitlist entries).
        </p>
        <p>
          Request deletion of account data at {company.legalEmail}. We will verify the request and
          delete or de-identify where feasible. Some records may be retained where required by law,
          for legitimate security purposes, or until backup cycles rotate.
        </p>
      </LegalSection>

      <LegalSection title="9. Security">
        <p>
          We use industry-standard measures including TLS in transit, access controls, secrets
          hygiene, and vendor controls appropriate to our stage. No method of transmission or
          storage is 100% secure. See our <Link href="/security">Security</Link> page. We do not
          claim SOC 2, ISO 27001, HIPAA, PCI DSS Level 1, FedRAMP, or similar certifications at
          this time.
        </p>
      </LegalSection>

      <LegalSection title="10. Your rights and requests">
        <p>
          Depending on your location and role (business user vs. caller), you may have rights to
          access, correct, delete, or export personal information; to appeal a denial; and to
          opt out of certain processing where applicable law provides that right.
        </p>
        <p>
          <strong>How to submit.</strong> Email {company.legalEmail} with enough detail to locate
          your data. We may verify identity (and authority, for agents). We respond within timelines
          required by applicable law (including up to 45 days where required, with permitted
          extensions).
        </p>
        <p>
          <strong>Callers.</strong> If you are a caller seeking deletion or access to data collected
          by a shop using {company.productName}, contact that business first as controller. We will
          assist that business as processor when they instruct us or when law requires.
        </p>
        <p>
          We will not discriminate against you for exercising privacy rights available under
          applicable law.
        </p>
      </LegalSection>

      <LegalSection title="11. California and other U.S. state privacy notices">
        <p>
          If you are a resident of California or another U.S. state with a comprehensive consumer
          privacy law (for example, Virginia, Colorado, Connecticut, Utah, and similar statutes as
          they apply), this section supplements the rest of this policy.
        </p>
        <p>
          <strong>Categories collected</strong> (in the last 12 months, as applicable to our
          Service): identifiers (name, email, phone, IP); commercial information (plan, billing
          status); internet/network activity (logs, pages); audio/electronic content (calls, SMS,
          transcripts where enabled); professional/employment-related information you provide about
          your shop; and inferences limited to product operation (for example, urgency labels on a
          lead). We do not collect biometric identifiers for unique identification or precise
          geolocation for advertising.
        </p>
        <p>
          <strong>Business / commercial purposes</strong> of collection and disclosure match §§4–5
          (provide Service, security, payments, legal compliance). We disclose categories to
          service providers listed in §6 and as otherwise described in §5.
        </p>
        <p>
          <strong>Sale and sharing.</strong> We do not sell personal information and do not share
          it for cross-context behavioral advertising as those terms are defined under the CCPA/CPRA
          and similar laws. We do not have actual knowledge of selling or sharing personal
          information of consumers under 16.
        </p>
        <p>
          <strong>Sensitive personal information.</strong> We do not use or disclose sensitive
          personal information to infer characteristics about consumers for purposes that require a
          &quot;Limit the Use of My Sensitive Personal Information&quot; link under CPRA. Account
          credentials and contents of communications are used to provide the Service you request.
        </p>
        <p>
          <strong>Rights.</strong> Subject to verification and exceptions, residents may request
          know/access, delete, correct, and (where applicable) opt-out of sale/sharing or targeted
          advertising. Because we do not sell or share for targeted advertising, an opt-out of sale/
          sharing is generally not applicable; you may still email {company.legalEmail} to confirm.
          Authorized agents may submit requests with proof of authority.
        </p>
        <p>
          <strong>Shine the Light.</strong> California Civil Code §1798.83 requests may be sent to{" "}
          {company.legalEmail}. We do not disclose personal information to third parties for their
          direct marketing in the manner that statute addresses.
        </p>
        <p>
          <strong>Appeals.</strong> If we deny a request, you may appeal by replying to our
          decision email. If your appeal is denied, you may contact your state attorney general
          where that remedy is available.
        </p>
      </LegalSection>

      <LegalSection title="12. Call recording, AI disclosure, and SMS">
        <p>
          Business customers are solely responsible for legally required notices to callers and
          texters about AI handling, recording, monitoring, and messaging consent (including TCPA
          and state analogues). Availability of product features does not guarantee compliance in
          every jurisdiction you serve. See <Link href="/sms-terms">SMS Terms</Link> and{" "}
          <Link href="/terms">Terms of Service</Link>.
        </p>
      </LegalSection>

      <LegalSection title="13. International processing">
        <p>
          The Service is designed and operated primarily for customers in the United States.
          Information is processed in the United States (and may transit through subprocessor
          regions they operate). If you access the Service from outside the United States, you
          understand information may be processed in the U.S.
        </p>
        <p>
          We do not currently market {company.productName} as a GDPR/UK GDPR-ready product with a
          standard contractual clauses package for EEA/UK controllers. If you require a signed Data
          Processing Agreement for a specific jurisdiction, contact {company.legalEmail} before
          sending regulated personal data.
        </p>
      </LegalSection>

      <LegalSection title="14. Children">
        <p>
          The Service is for businesses and is not directed to individuals under 18. We do not
          knowingly collect personal information from children. If you believe a child provided
          data, contact {company.legalEmail} and we will take appropriate steps.
        </p>
      </LegalSection>

      <LegalSection title="15. Do Not Track">
        <p>
          Some browsers offer a &quot;Do Not Track&quot; signal. Because there is no consistent
          industry standard for responding to DNT, we do not alter practices solely based on DNT
          signals. Our default is essential cookies only; see the{" "}
          <Link href="/cookies">Cookie Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection title="16. Changes">
        <p>
          We may update this policy by posting a revised version with an updated date. Material
          changes will be posted on this page. Continued use after the effective date constitutes
          acceptance where permitted by law. If you disagree, stop using the Service and request
          account closure.
        </p>
      </LegalSection>

      <LegalSection title="17. Contact">
        <p>
          {company.legalName}
          <br />
          Privacy / legal: {company.legalEmail}
          <br />
          {company.domain}
        </p>
        <p className="text-sm text-ash">
          This Privacy Policy is a protective template for {company.legalName}. Have qualified
          counsel review and localize it (including state-law mappings and any EU/UK packaging)
          before relying on it in a dispute or regulatory response.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
