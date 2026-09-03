import { LegalDocument, LegalSection } from "@/components/legal-document";
import { company } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "DMCA / Copyright",
  description: `Copyright and trademark policy for ${company.productName} / ${company.legalName}.`,
};

export default function DmcaPage() {
  return (
    <LegalDocument
      label="Legal"
      title="DMCA & Copyright Policy"
      description={`Copyright notices, designated agent information, and trademark statement for ${company.legalName}.`}
      updated={company.legalUpdated}
    >
      <LegalSection title="1. Ownership">
        <p>
          The {company.productName} website, software, documentation, and branding are owned by{" "}
          {company.legalName} or its licensors. {company.trademarkNotice} Unauthorized use is
          prohibited.
        </p>
        <p>
          © {new Date().getFullYear()} {company.legalName}. {company.copyrightNotice}
        </p>
      </LegalSection>

      <LegalSection title="2. DMCA designated agent">
        <p>
          If you believe material on the Service infringes your copyright, send a notice under 17
          U.S.C. §512 to:
        </p>
        <p>
          DMCA Agent
          <br />
          {company.legalName}
          <br />
          Email: {company.dmcaEmail}
        </p>
      </LegalSection>

      <LegalSection title="3. Notice requirements">
        <p>Your notice should include:</p>
        <ul>
          <li>Identification of the copyrighted work claimed to be infringed</li>
          <li>Identification of the material claimed to be infringing and information reasonably sufficient to locate it</li>
          <li>Your contact information</li>
          <li>A statement that you have a good-faith belief the use is not authorized</li>
          <li>
            A statement, under penalty of perjury, that the information is accurate and that you are
            the owner or authorized to act
          </li>
          <li>Your physical or electronic signature</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Counter-notice">
        <p>
          If material was removed and you believe it was a mistake or misidentification, you may
          send a counter-notice to {company.dmcaEmail} including the information required by 17
          U.S.C. §512(g).
        </p>
      </LegalSection>

      <LegalSection title="5. Repeat infringers">
        <p>
          We may terminate accounts of users who are repeat infringers in appropriate
          circumstances.
        </p>
      </LegalSection>

      <LegalSection title="6. Related">
        <p>
          See <Link href="/terms">Terms of Service</Link> and our{" "}
          <Link href="/legal">Legal center</Link>.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
