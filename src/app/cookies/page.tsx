import { LegalDocument, LegalSection } from "@/components/legal-document";
import { company } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
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

      <LegalSection title="3. Analytics (not enabled by default)">
        <p>
          If we enable non-essential product or traffic analytics in the future, we will update this
          policy and the in-product notice before collecting those cookies. Until then, do not
          assume analytics cookies are active.
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
