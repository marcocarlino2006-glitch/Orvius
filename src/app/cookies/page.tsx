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
      <LegalSection title="1. What we use">
        <p>
          <strong>Essential cookies.</strong> Required for authentication,
          security, form submissions, and basic site functionality.
        </p>
        <p>
          <strong>Preference cookies.</strong> Remember choices such as cookie
          consent (stored locally in your browser when you accept our banner).
        </p>
        <p>
          <strong>Analytics (optional).</strong> If enabled, help us understand
          aggregate traffic and improve the site. We do not sell cookie data.
        </p>
      </LegalSection>

      <LegalSection title="2. Your choices">
        <p>
          You can block or delete cookies in your browser settings. Essential
          cookies may be required for parts of the Service to function. When you
          click &quot;Accept&quot; on our cookie banner, we record consent in
          local storage on your device.
        </p>
      </LegalSection>

      <LegalSection title="3. Third parties">
        <p>
          Payment processing (Stripe), hosting (Vercel), and communications
          providers may set their own cookies when you interact with their
          flows. See their policies for details.
        </p>
      </LegalSection>

      <LegalSection title="4. Contact">
        <p>
          Questions: {company.contactEmail}. See also our{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
