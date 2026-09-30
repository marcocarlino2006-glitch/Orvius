import { LegalDocument, LegalSection } from "@/components/legal-document";
import { company } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "SMS Terms",
  description: `SMS program terms for ${company.productName} owner alerts and the service texts shops send their customers, operated by ${company.legalName}.`,
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
          {company.legalName} operates {company.productName}, which sends two
          kinds of transactional text messages. No marketing messages are sent.
        </p>
        <p>
          <strong>Owner alerts.</strong> Business owners and authorized staff
          receive texts when leads are captured, calls are handled, or account
          notifications are required.
        </p>
        <p>
          <strong>Service texts to a shop&apos;s customers.</strong> When a
          person calls or texts a home-service business that uses{" "}
          {company.productName} and asks for service, that business may text
          them about that request: that the request was received, a proposed or
          booked appointment and a request to confirm it, a reminder, a single
          follow-up if nobody from the shop has reached them yet, and a link to
          pay a deposit or invoice. Replies go to the shop.
        </p>
        <p>
          Message frequency varies with the request, typically one to five
          messages per service request.
        </p>
      </LegalSection>

      <LegalSection title="2. Consent">
        <p>
          <strong>Owners and staff.</strong> By providing your mobile number
          during onboarding and enabling owner alerts, you consent to receive
          transactional SMS from {company.smsProgramName}. Consent is not a
          condition of purchasing any goods or services except receiving SMS
          alerts through the Service.
        </p>
        <p>
          <strong>Customers.</strong> A customer gives the business their mobile
          number on the call or in their text so the business can reach them
          about the service they asked for. Texts are sent only about that
          request, and the first text says who it is from and how to opt out.
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
          keywords on inbound SMS: STOP does not create a lead, confirms the
          unsubscribe, and stops every further text from that business to that
          number (and owner alerts, when the sender is the registered owner
          number). Reply <strong>START</strong> (or YES / UNSTOP) to re-subscribe. Reply{" "}
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
