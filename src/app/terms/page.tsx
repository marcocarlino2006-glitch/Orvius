import { LegalDocument, LegalSection } from "@/components/legal-document";
import { company, getPlanById } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `Terms of Service for ${company.productName}, a product of ${company.legalName}.`,
};

const pro = getPlanById("pro");

export default function TermsPage() {
  return (
    <LegalDocument
      label="Legal"
      title="Terms of Service"
      description={`These Terms govern access to and use of ${company.productName}, operated by ${company.legalName}. Read carefully. They include a binding arbitration clause and class-action waiver.`}
      updated={company.legalUpdated}
    >
      <LegalSection title="1. Agreement">
        <p>
          By accessing {company.domain}, applying for a pilot, creating an account, or using{" "}
          {company.productName} (the &quot;Service&quot;), you agree to these Terms of Service
          (&quot;Terms&quot;) with {company.legalName} (&quot;Company,&quot; &quot;we,&quot;
          &quot;us&quot;). If you accept on behalf of a business, you represent that you have
          authority to bind that business. If you do not agree, do not use the Service.
        </p>
        <p>
          These Terms incorporate our{" "}
          <Link href="/privacy">Privacy Policy</Link>,{" "}
          <Link href="/sms-terms">SMS Terms</Link>, and{" "}
          <Link href="/refunds">Refunds &amp; Cancellation</Link> policy.
        </p>
      </LegalSection>

      <LegalSection title="2. The Service">
        <p>
          {company.productName} provides AI-assisted call and text handling and related workspace
          tools for home-service businesses, including qualification, summaries, owner
          notifications, jobs, dispatch, and related features we make available. The Service is
          designed for {company.trades.join(", ")}, and related trades we approve.
        </p>
        <p>
          We improve the Service continuously. Features, providers, and integrations may change.
          Marketing descriptions and product demos are illustrative and do not guarantee any
          particular answer rate, booking rate, revenue outcome, or uptime. Unless we execute a
          separate written service-level agreement, the Service is provided without a formal SLA.
        </p>
        <p>
          {company.productName} is a software vendor. We are not your attorney, insurer, licensed
          trade professional, emergency service, or agent for professional licensing.{" "}
          <strong>The Service is not a HIPAA-covered product</strong> and is not intended for use
          as a system of record for protected health information (PHI) unless we expressly agree in
          a signed business associate agreement. Do not configure the Service as your sole
          life-safety or 911 dispatch path.
        </p>
      </LegalSection>

      <LegalSection title="3. Accounts and eligibility">
        <p>
          You must provide accurate account and business information and keep it updated. You are
          responsible for activity under your account and for safeguarding access credentials. The
          Service is intended for business use by persons 18 years of age or older.
        </p>
      </LegalSection>

      <LegalSection title="4. Pilot program">
        <p>
          Eligible businesses may join a limited design-partner pilot at no charge for thirty (30)
          days, subject to availability. Pilot features are described on our{" "}
          <Link href="/pricing">pricing page</Link> and may differ from paid plans.
        </p>
        <p>
          Continued use after the pilot requires a paid plan (for example, {company.productName}{" "}
          Pro at ${pro?.price ?? 299}/month, unless otherwise agreed in writing). We will notify you
          before any charge begins. Pilot access may be revoked for abuse or material breach.
        </p>
      </LegalSection>

      <LegalSection title="5. Fees and payment">
        <p>
          Paid plans are billed in advance by {company.legalName} (or our payment processor) on the
          interval you select. Fees are non-refundable except where required by law or stated in our{" "}
          <Link href="/refunds">Refunds &amp; Cancellation</Link> policy. You authorize recurring
          charges to your payment method on file.
        </p>
        <p>
          Failure to pay may result in suspension. You remain responsible for charges incurred
          before suspension. Taxes may apply.
        </p>
      </LegalSection>

      <LegalSection title="6. Intellectual property and license">
        <p>
          The Service, including software, models, prompts, interfaces, documentation, branding,
          and related materials, is owned by {company.legalName} and its licensors.{" "}
          {company.trademarkNotice} Except for the limited license below, no rights are granted by
          implication.
        </p>
        <p>
          Subject to these Terms and timely payment (if applicable), we grant you a limited,
          non-exclusive, non-transferable, non-sublicensable, revocable license to access and use
          the Service for your internal business operations during your subscription or pilot term.
        </p>
        <p>
          You retain ownership of your business content and caller-related data you provide or
          collect through your lines (&quot;Customer Content&quot;). You grant {company.legalName} a
          worldwide license to host, process, transmit, and display Customer Content solely to
          provide and secure the Service, comply with law, and improve reliability of the Service
          for your account. When we process end-customer personal information in Customer Content,
          we do so as your processor / service provider as described in our{" "}
          <Link href="/privacy">Privacy Policy</Link> (including processor terms). Feedback you
          provide may be used to improve the Service without obligation or attribution.
        </p>
      </LegalSection>

      <LegalSection title="7. Your responsibilities">
        <ul>
          <li>Provide accurate business information, hours, services, and owner contacts.</li>
          <li>Ensure you have the right to forward or provision phone numbers used with the Service.</li>
          <li>
            Comply with all laws applicable to your operations, including call recording and AI
            disclosure, telemarketing, TCPA and similar SMS consent rules, do-not-call requirements,
            truth-in-advertising, and trade licensing.
          </li>
          <li>
            Configure required notices to callers (recording, monitoring, AI/virtual receptionist)
            for every jurisdiction you serve.
          </li>
          <li>
            Review AI-generated summaries, urgency labels, bookings, and Ask answers before relying
            on them for dispatch, pricing, hiring, or safety-critical decisions.
          </li>
          <li>Obtain required consent before sending SMS to callers, technicians, or other parties.</li>
        </ul>
      </LegalSection>

      <LegalSection title="8. Acceptable use">
        <p>You may not use the Service to:</p>
        <ul>
          <li>Violate law or third-party rights</li>
          <li>Send SMS or place calls without required consent or required disclosures</li>
          <li>Transmit unlawful, harassing, deceptive, or fraudulent content</li>
          <li>Impersonate a human where disclosure is legally required</li>
          <li>Reverse-engineer, scrape, overload, or attack our systems or providers</li>
          <li>Resell, white-label, or provide the Service to third parties without our written consent</li>
          <li>
            Rely on the Service as the sole life-safety, medical emergency, or critical
            infrastructure dispatch system
          </li>
        </ul>
        <p>We may suspend or terminate access for violations.</p>
      </LegalSection>

      <LegalSection title="9. AI, automation, and recording">
        <p>
          The Service uses automated systems. Outputs may be incomplete, delayed, or incorrect. The
          Service is not a substitute for licensed trade judgment, emergency services (call 911), or
          legal, medical, or financial advice.
        </p>
        <p>
          You are solely responsible for call-recording and AI-disclosure notices required where you
          operate. Availability of tools or default prompts does not guarantee legal compliance in
          your jurisdictions.
        </p>
      </LegalSection>

      <LegalSection title="10. Third-party providers">
        <p>
          The Service relies on third parties (carriers, voice AI, hosting, payments, identity).
          Their outages, latency, or policy changes may affect the Service. We are not liable for
          failures caused solely by third parties outside our reasonable control. See our{" "}
          <Link href="/privacy">Privacy Policy</Link> for subprocessors.
        </p>
      </LegalSection>

      <LegalSection title="11. Disclaimer of warranties">
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE.&quot; TO THE MAXIMUM
          EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING
          MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT
          WARRANT UNINTERRUPTED OR ERROR-FREE OPERATION, OR THAT EVERY CALL WILL BE ANSWERED,
          QUALIFIED, OR BOOKED.
        </p>
      </LegalSection>

      <LegalSection title="12. Limitation of liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, {company.legalName.toUpperCase()} AND ITS
          MEMBERS, OFFICERS, EMPLOYEES, AND CONTRACTORS WILL NOT BE LIABLE FOR ANY INDIRECT,
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR ANY LOSS OF
          PROFITS, REVENUE, DATA, GOODWILL, OR BUSINESS OPPORTUNITY (INCLUDING MISSED CALLS OR LOST
          JOBS), ARISING FROM THE SERVICE OR THESE TERMS, WHETHER BASED IN CONTRACT, TORT, OR
          OTHERWISE, EVEN IF ADVISED OF THE POSSIBILITY.
        </p>
        <p>
          OUR TOTAL LIABILITY FOR ALL CLAIMS RELATING TO THE SERVICE IS LIMITED TO THE AMOUNTS YOU
          PAID US FOR THE SERVICE IN THE TWELVE (12) MONTHS BEFORE THE CLAIM, OR ONE HUNDRED DOLLARS
          ($100) IF YOU HAVE NOT PAID (INCLUDING PILOT USERS), WHICHEVER IS GREATER.
        </p>
      </LegalSection>

      <LegalSection title="13. Indemnification">
        <p>
          You will defend, indemnify, and hold harmless {company.legalName} and its members,
          officers, employees, and agents from and against claims, damages, losses, and expenses
          (including reasonable attorneys&apos; fees) arising out of or related to: (a) your use of
          the Service; (b) Customer Content; (c) your violation of law (including TCPA, recording,
          telemarketing, and licensing laws); (d) disputes with callers, customers, technicians, or
          other third parties; or (e) your breach of these Terms.
        </p>
      </LegalSection>

      <LegalSection title="14. Termination">
        <p>
          You may cancel under our <Link href="/refunds">Refunds &amp; Cancellation</Link> policy.
          We may suspend or terminate access for material breach, non-payment, legal risk, or abuse.
          Upon termination, your license ends. Reasonable export of Customer Content (where
          available in-product or via support) should be requested before or promptly after
          cancellation; afterward we delete or de-identify per our{" "}
          <Link href="/privacy">Privacy Policy</Link>, subject to legal and backup retention.
          Sections that by nature should survive (including IP, fees owed, disclaimers, liability
          limits, indemnity, and dispute resolution) survive.
        </p>
      </LegalSection>

      <LegalSection title="15. Dispute resolution; arbitration; class waiver">
        <p>
          These Terms are governed by the laws of {company.governingLawState}, without regard to
          conflict-of-law rules, except that the Federal Arbitration Act governs interpretation and
          enforcement of this arbitration agreement.
        </p>
        <p>
          <strong>Binding arbitration.</strong> Except for small-claims court actions and claims for
          injunctive or other equitable relief to protect intellectual property or unauthorized use
          of the Service, any dispute arising out of or relating to these Terms or the Service will
          be resolved by binding individual arbitration administered by the American Arbitration
          Association under its Commercial Arbitration Rules. Judgment on the award may be entered
          in any court of competent jurisdiction.
        </p>
        <p>
          <strong>Class-action waiver.</strong> YOU AND COMPANY AGREE THAT EACH MAY BRING CLAIMS
          AGAINST THE OTHER ONLY IN AN INDIVIDUAL CAPACITY AND NOT AS A PLAINTIFF OR CLASS MEMBER IN
          ANY PURPORTED CLASS, CONSOLIDATED, OR REPRESENTATIVE PROCEEDING.
        </p>
        <p>
          If the class waiver is found unenforceable as to a particular claim, that claim (and only
          that claim) may proceed in court; remaining claims stay in arbitration. Either party may
          seek temporary injunctive relief in court to protect IP or stop unauthorized access
          pending arbitration.
        </p>
      </LegalSection>

      <LegalSection title="16. Force majeure">
        <p>
          Neither party is liable for delay or failure to perform due to events beyond reasonable
          control, including natural disasters, war, terrorism, labor disputes, government action,
          internet or carrier outages, power failures, or failures of third-party providers
          (telephony, voice AI, hosting, payments) outside that party&apos;s reasonable control.
          Payment obligations for fees already incurred are not excused.
        </p>
      </LegalSection>

      <LegalSection title="17. Changes">
        <p>
          We may update these Terms by posting a revised version with an updated date. Material
          changes will be posted on this page. Continued use after the effective date constitutes
          acceptance. If you disagree, stop using the Service and cancel.
        </p>
      </LegalSection>

      <LegalSection title="18. Miscellaneous">
        <p>
          These Terms are the entire agreement regarding the Service and supersede prior
          conflicting terms for the same subject. If a provision is unenforceable, the remainder
          stays in effect. Failure to enforce is not a waiver. You may not assign these Terms
          without our consent; we may assign to an affiliate or successor. Notices may be sent to
          your account email and to {company.legalEmail}. Headings are for convenience only.
        </p>
      </LegalSection>

      <LegalSection title="19. Contact">
        <p>
          {company.legalName}
          <br />
          {company.legalEmail}
          <br />
          {company.domain}
        </p>
        <p className="text-sm text-ash">
          These Terms are a protective template for {company.legalName}. Have qualified counsel
          review and localize them (including governing law and arbitration) for your formation
          state and risk profile before relying on them in a dispute.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
