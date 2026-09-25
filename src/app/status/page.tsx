import { LegalDocument, LegalSection } from "@/components/legal-document";
import { company } from "@/lib/company";
import { prisma } from "@/lib/prisma";
import {
  fetchProviderStatuses,
  summarizeProviders,
  type ProviderState,
} from "@/lib/provider-status";
import type { Metadata } from "next";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Status",
  description: `Live status of ${company.productName} and the providers every call depends on.`,
};

const STATE_LABEL: Record<ProviderState, string> = {
  operational: "No issues reported",
  degraded: "Reporting issues",
  outage: "Reported outage",
  unknown: "Check their page",
};

async function appReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export default async function StatusPage() {
  const [appUp, providers] = await Promise.all([appReachable(), fetchProviderStatuses()]);
  const summary = summarizeProviders(providers);
  const checkedAt = new Date().toUTCString();

  return (
    <LegalDocument
      label="Trust"
      title="Status"
      description="What is working right now — our app, and each outside service a call passes through. Refreshed every minute."
      updated={checkedAt}
    >
      <LegalSection title="Orvius app and records">
        <p className="status-row" data-state={appUp ? "operational" : "outage"}>
          <span className="status-dot" aria-hidden />
          <strong>{appUp ? "Reachable" : "Not reachable"}</strong>
          <span>
            {appUp
              ? "The dashboard is serving and new calls can be written down."
              : "The dashboard or its records are not answering. Calls are still answered by the voice line; they are saved once records are back."}
          </span>
        </p>
      </LegalSection>

      <LegalSection title="Providers every call depends on">
        <p>{summary.line}</p>
        <ul className="status-list">
          {providers.map((p) => (
            <li key={p.id} className="status-row" data-state={p.state}>
              <span className="status-dot" aria-hidden />
              <strong>{p.name}</strong>
              <span>
                {p.role} — {p.description ?? STATE_LABEL[p.state]}.{" "}
                <a href={p.page} target="_blank" rel="noopener noreferrer">
                  Their status page
                </a>
              </span>
            </li>
          ))}
        </ul>
      </LegalSection>

      <LegalSection title="What this page can and cannot tell you">
        <p>
          Provider lines are read from each provider&apos;s own public status page. Vapi does not
          publish a machine-readable status, so we link to it instead of guessing. A provider
          saying &ldquo;no issues&rdquo; does not prove your line is answering — your dashboard
          shows when your own line last took a call.
        </p>
        <p>
          If something here is wrong or you are seeing a problem we are not, email{" "}
          <a href={`mailto:${company.supportEmail}`}>{company.supportEmail}</a>.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
