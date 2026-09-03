import { LegalDocument, LegalSection } from "@/components/legal-document";
import { company } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "SMS Terms",
  description: `SMS program terms for ${company.productName} owner alerts, operated by ${company.legalName}.`,
};

export default function SmsTermsPage() {
  return (
    <LegalDocument
      label="Legal"
      title="SMS Terms & Conditions"
      description={`These terms apply to text messages sent through ${company.productName} (${company.smsProgramName}).`}
      updated={company.legalUpdated}
    >
      <LegalSection title="1. Program description">
        <p>
          {company.legalName} operates {company.productName}, which may send SMS
          messages to business owners and authorized staff when leads are
          captured, calls are handled, or account notifications are required.
          Message frequency varies based on inbound customer activity.
        </p>
      </LegalSection>

      <LegalSection title="2. Consent">
        <p>
          By providing your mobile number during onboarding and enabling owner
          alerts, you consent to receive transactional SMS from{" "}
          {company.smsProgramName}. Consent is not a condition of purchasing any
          goods or services except receiving SMS alerts through the Service.
        </p>
        <p>
          <strong>Customer responsibility.</strong> Business customers are
          responsible for obtaining any legally required consent from their
          callers and texters regarding call handling, recording, and AI
          interaction in their jurisdiction.
        </p>
      </LegalSection>

      <LegalSection title="3. Opt-out and help">
        <p>
          Reply <strong>STOP</strong>, <strong>STOPALL</strong>,{" "}
          <strong>UNSUBSCRIBE</strong>, <strong>CANCEL</strong>, <strong>END</strong>, or{" "}
          <strong>QUIT</strong> to any {company.productName} message to opt out. We process these
          keywords on inbound SMS to your shop line: STOP does not create a lead, confirms
          unsubscribe, and suppresses further owner-alert SMS when the sender is the registered
          owner number. Reply <strong>START</strong> (or YES / UNSTOP) to re-subscribe. Reply{" "}
          <strong>HELP</strong> or <strong>INFO</strong> for assistance.
        </p>
        <p>
          After opting out, you may miss time-sensitive lead notifications. Email{" "}
          {company.supportEmail} for account support.
        </p>
      </LegalSection>

      <LegalSection title="4. Carrier charges">
        <p>
          Message and data rates may apply. Carriers are not liable for delayed
          or undelivered messages.
        </p>
      </LegalSection>

      <LegalSection title="5. Related policies">
        <p>
          See our <Link href="/privacy">Privacy Policy</Link> and{" "}
          <Link href="/terms">Terms of Service</Link> for data handling and
          service use. For the full legal index, visit our{" "}
          <Link href="/legal">Legal center</Link>.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
