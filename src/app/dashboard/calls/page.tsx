"use client";

import { CallRecordCard } from "@/components/call-record-card";
import { ProLead } from "@/components/pro-lead";
import { ProEmptyState, ProListEnd } from "@/components/pro-page-chrome";
import { ProShopLineCta } from "@/components/pro-shop-line-cta";
import { OsShell } from "@/components/os-shell";
import { ShellAlert } from "@/components/shell-primitives";
import { DashboardSkeleton } from "@/components/shell-skeleton";
import { isAfterHours } from "@/lib/after-hours";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CallRow = {
  id: string;
  callerPhone: string | null;
  status: string;
  summary: string | null;
  durationSec: number | null;
  booked: boolean;
  createdAt: string;
  business: { name: string } | null;
  customer: { id: string; name: string | null; interactionCount: number } | null;
  lead: {
    id: string;
    name: string | null;
    serviceType: string | null;
    urgency: string | null;
  } | null;
};

export default function CallsPage() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/calls?limit=50")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load calls");
        return res.json();
      })
      .then((data) => {
        setCalls(data.calls ?? []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const tally = useMemo(
    () => ({
      afterHours: calls.filter((call) => isAfterHours(new Date(call.createdAt)))
        .length,
      booked: calls.filter((call) => call.booked).length,
      returning: calls.filter(
        (call) => (call.customer?.interactionCount ?? 0) > 1,
      ).length,
    }),
    [calls],
  );

  return (
    <OsShell
      title="Calls"
      actions={
        <Link href="/dashboard/inbox" className="btn btn-void text-sm">
          Inbox
        </Link>
      }
    >
      <ProLead
        loading={loading}
        figure={String(calls.length)}
        caption={calls.length === 1 ? "call answered" : "calls answered"}
        detail="Every one transcribed, qualified, and filed against a customer."
        facts={[
          {
            label: "after hours",
            value: tally.afterHours,
            live: tally.afterHours > 0,
          },
          { label: "booked", value: tally.booked, live: tally.booked > 0 },
          { label: "returning", value: tally.returning },
        ]}
        action={<ProShopLineCta label="Test call" showNumber={false} />}
      />

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          {error ? (
            <div className="mb-6">
              <ShellAlert tone="error">{error}</ShellAlert>
            </div>
          ) : null}

          {!calls.length ? (
            <ProEmptyState
              title="No calls yet"
              body="Every inbound call is transcribed and linked to a lead in your inbox."
              action={<ProShopLineCta showNumber={false} />}
            />
          ) : (
            <ul className="os-lead-rail">
              {calls.map((call) => (
                <li key={call.id}>
                  <CallRecordCard
                    id={call.id}
                    callerPhone={call.callerPhone}
                    status={call.status}
                    summary={call.summary}
                    durationSec={call.durationSec}
                    booked={call.booked}
                    createdAt={call.createdAt}
                    businessName={call.business?.name}
                    leadName={call.lead?.name}
                    serviceType={call.lead?.serviceType}
                    urgency={call.lead?.urgency}
                    returning={(call.customer?.interactionCount ?? 0) > 1}
                  />
                </li>
              ))}
            </ul>
          )}
          {calls.length ? (
            <ProListEnd count={calls.length} noun="call" />
          ) : null}
        </>
      )}
    </OsShell>
  );
}
