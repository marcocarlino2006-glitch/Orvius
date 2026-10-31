import { LegalDocument, LegalSection } from "@/components/legal-document";
import { company } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  alternates: { canonical: "/cookies" },
  title: "Cookie Policy",
  description: `Cookie Policy for ${company.domain}, operated by ${company.legalName}.`,
};

export default function CookiesPage() {
  return (
    <LegalDocument
      label="Legal"
      title="Cookie Policy"
      description={`This policy explains how ${company.legalName} uses cookies and similar technologies on ${company.domain}.`}
      updated={company.legalUpdated}
    >
      <LegalSection title="1. Default: essential cookies">
        <p>
          Orvius&apos;s default configuration uses <strong>essential cookies and similar storage
          only</strong> — required for authentication, security (including CSRF protection), form
          submissions, and remembering that you acknowledged this notice. We do not use advertising
          cookies and we do not sell cookie data.
        </p>
      </LegalSection>

      <LegalSection title="2. Preference storage">
        <p>
          When you click &quot;OK&quot; on our cookie notice, we record that acknowledgment in
          local storage on your device so we do not show the notice again on every visit.
        </p>
      </LegalSection>

      <LegalSection title="3. Sign-up counts (no cookies)">
        <p>
          We count how many people reach each step of signing up: the pricing page, the sign-up
          page, setup, the pay step and checkout. This sets no cookie and stores nothing on your
          device. Before you sign in, a visit is recorded as a one-way code made from your network
          address, your browser and a key that changes every day, so the same visit tomorrow can&apos;t
          be linked to today&apos;s and your address is never stored. After you sign in, the step is
          recorded against a one-way code of your account email. If your browser sends Do Not Track
          or Global Privacy Control, nothing is counted.
        </p>
        <p>
          We do not use advertising or third-party analytics cookies. If that ever changes, we will
          update this policy and the in-product notice first.
        </p>
      </LegalSection>

      <LegalSection title="4. Third parties">
        <p>
          Payment processing (Stripe), hosting (Vercel), and communications providers may set their
          own cookies when you interact with their flows. See their policies for details.
        </p>
      </LegalSection>

      <LegalSection title="5. Your choices">
        <p>
          You can clear cookies and site data in your browser settings. Blocking essential cookies
          may prevent login or secure form submission. California and other state privacy rights
          (access, deletion, do-not-sell confirmation) are described in our{" "}
          <Link href="/privacy">Privacy Policy</Link>. Questions: {company.contactEmail}.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
