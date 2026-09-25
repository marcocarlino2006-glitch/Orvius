import { LegalDocument, LegalSection } from "@/components/legal-document";
import { CHANGELOG } from "@/lib/changelog";
import { company } from "@/lib/company";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Changelog",
  description: `What changed in ${company.productName}, newest first.`,
};

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function ChangelogPage() {
  return (
    <LegalDocument
      label="Product"
      title="Changelog"
      description="Everything that shipped, newest first. Only what is in the product today."
      updated={formatDate(CHANGELOG[0].date)}
    >
      {CHANGELOG.map((entry) => (
        <LegalSection key={`${entry.date}-${entry.title}`} title={`${formatDate(entry.date)} — ${entry.title}`}>
          <ul>
            {entry.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </LegalSection>
      ))}
    </LegalDocument>
  );
}
