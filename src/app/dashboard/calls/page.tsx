"use client";

import { OsShell } from "@/components/os-shell";
import { ShellAlert, ShellBadge, ShellEmpty, ShellListItem, ShellPanel } from "@/components/shell-primitives";
import Link from "next/link";
import { useEffect, useState } from "react";

type CallRow = {
  id: string;
  callerPhone: string | null;
  status: string;
  summary: string | null;
  createdAt: string;
  business: { name: string } | null;
  customer: { id: string; name: string | null; interactionCount: number } | null;
};

export default function CallsPage() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load calls");
        return res.json();
      })
      .then((data) => setCalls(data.recentCalls ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <OsShell title="Calls" subtitle="Inbound voice. The record starts here.">
      {loading ? (
        <p className="font-sans text-sm text-ash">Loading…</p>
      ) : (
        <>
          {error ? (
            <div className="mb-6">
              <ShellAlert tone="error">{error}</ShellAlert>
            </div>
          ) : null}

          {!calls.length ? (
            <ShellEmpty>No calls yet.</ShellEmpty>
          ) : (
            <ShellPanel title="Recent calls">
              <ul className="space-y-3">
                {calls.map((call) => (
                  <ShellListItem
                    key={call.id}
                    title={call.business?.name ?? "Unknown business"}
                    meta={new Date(call.createdAt).toLocaleString()}
                  >
                    <div className="mt-2 flex flex-wrap gap-2">
                      <ShellBadge tone="live">{call.status}</ShellBadge>
                      {call.customer && call.customer.interactionCount > 1 ? (
                        <ShellBadge tone="neutral">Returning</ShellBadge>
                      ) : null}
                    </div>
                    <p className="mt-2 font-sans text-sm text-ash">
                      {call.callerPhone ?? "Unknown caller"}
                    </p>
                    {call.summary ? (
                      <p className="mt-2 font-sans text-sm leading-relaxed text-void">
                        {call.summary}
                      </p>
                    ) : null}
                    <Link
                      href={`/dashboard/calls/${call.id}`}
                      className="customer-timeline-link mt-2 inline-block font-sans"
                    >
                      View call →
                    </Link>
                  </ShellListItem>
                ))}
              </ul>
            </ShellPanel>
          )}
        </>
      )}
    </OsShell>
  );
}
