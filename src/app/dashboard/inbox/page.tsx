"use client";

import { LeadInboxCard } from "@/components/lead-inbox-card";
import { OsShell } from "@/components/os-shell";
import { ShellAlert, ShellEmpty } from "@/components/shell-primitives";
import { DashboardSkeleton } from "@/components/shell-skeleton";
import Link from "next/link";
import { useEffect, useState } from "react";

type LeadRow = {
  id: string;
  name: string | null;
  phone: string | null;
  serviceType: string | null;
  urgency: string | null;
  address: string | null;
  createdAt: string;
  business: { name: string } | null;
  customer: { id: string; interactionCount: number } | null;
};

export default function InboxPage() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load inbox");
        return res.json();
      })
      .then((data) => setLeads(data.recentLeads ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <OsShell
      title="Inbox"
      subtitle="Every qualified lead from calls and texts — ready to close."
      actions={
        <Link href="/demo" className="btn btn-secondary text-sm">
          Demo call
        </Link>
      }
    >
      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          {error ? (
            <div className="mb-6">
              <ShellAlert tone="error">{error}</ShellAlert>
            </div>
          ) : null}

          {!leads.length ? (
            <ShellEmpty>
              No leads yet. Run a demo call or test your live line.
            </ShellEmpty>
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2">
              {leads.map((lead) => (
                <li key={lead.id}>
                  <LeadInboxCard
                    id={lead.id}
                    name={lead.name ?? "Unknown caller"}
                    phone={lead.phone}
                    service={lead.serviceType}
                    urgency={lead.urgency}
                    address={lead.address}
                    business={lead.business?.name ?? null}
                    createdAt={lead.createdAt}
                    customerId={lead.customer?.id ?? null}
                    returning={(lead.customer?.interactionCount ?? 0) > 1}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </OsShell>
  );
}
