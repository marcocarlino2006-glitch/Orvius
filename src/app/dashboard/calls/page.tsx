"use client";

import { CallRecordCard, CallTableHead } from "@/components/call-record-card";
import { ProLead } from "@/components/pro-lead";
import { ProEmptyState, ProFilterBar } from "@/components/pro-page-chrome";
import { ProShopLineCta } from "@/components/pro-shop-line-cta";
import { OsShell } from "@/components/os-shell";
import { ShellAlert } from "@/components/shell-primitives";
import { DashboardSkeleton } from "@/components/shell-skeleton";
import type { CallQualitySummary, CallVerdict } from "@/lib/call-quality";
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
  /** Set by the API against the shop's own hours, not the viewer's clock. */
  afterHours: boolean;
  business: { name: string } | null;
  customer: { id: string; name: string | null; interactionCount: number } | null;
  lead: {
    id: string;
    name: string | null;
    serviceType: string | null;
    urgency: string | null;
  } | null;
  quality: { score: number; verdict: CallVerdict; headline: string };
};

function qualityDetail(summary: CallQualitySummary | null) {
  if (!summary?.graded) return "Every one transcribed, qualified, and filed against a customer.";
  const review = summary.listen + summary.fix;
  if (!review) {
    return `Every call reviewed. All ${summary.graded} went cleanly.`;
  }
  const top = summary.top[0];
  return `${summary.clean} of ${summary.graded} went cleanly. ${review} ${
    review === 1 ? "is" : "are"
  } worth a listen${top ? `, most often for ${top.label}` : ""}.`;
}

export default function CallsPage() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [quality, setQuality] = useState<CallQualitySummary | null>(null);
  const [filter, setFilter] = useState<"" | "review">("");

  useEffect(() => {
    fetch("/api/calls?limit=50")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load calls");
        return res.json();
      })
      .then((data) => {
        setCalls(data.calls ?? []);
        setQuality(data.quality ?? null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const tally = useMemo(
    () => ({
      afterHours: calls.filter((call) => call.afterHours).length,
      booked: calls.filter((call) => call.booked).length,
      returning: calls.filter(
        (call) => (call.customer?.interactionCount ?? 0) > 1,
      ).length,
    }),
    [calls],
  );
  const toReview = calls.filter((call) => call.quality?.verdict !== "clean");
  const shown = filter === "review" ? toReview : calls;

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
        caption="Answered"
        detail={qualityDetail(quality)}
        facts={[
          {
            label: "After hours",
            value: tally.afterHours,
          },
          { label: "Booked", value: tally.booked },
          { label: "Returning", value: tally.returning },
          { label: "To review", value: toReview.length, live: toReview.length > 0 },
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
            <>
            <ProFilterBar
              className="mb-4"
              value={filter}
              onChange={(value) => setFilter(value === "review" ? "review" : "")}
              options={[
                { value: "", label: "All calls", count: calls.length },
                { value: "review", label: "Worth a listen", count: toReview.length },
              ]}
            />
            {!shown.length ? (
              <p className="font-sans text-sm text-ash">
                Nothing to review. Every call on this page went cleanly.
              </p>
            ) : null}
            <div className="dt dt--calls font-sans" role="table" aria-label="Calls">
              <CallTableHead />
              {shown.map((call) => (
                  <CallRecordCard
                    key={call.id}
                    id={call.id}
                    callerPhone={call.callerPhone}
                    status={call.status}
                    summary={call.summary}
                    durationSec={call.durationSec}
                    booked={call.booked}
                    createdAt={call.createdAt}
                    leadName={call.lead?.name}
                    serviceType={call.lead?.serviceType}
                    urgency={call.lead?.urgency}
                    returning={(call.customer?.interactionCount ?? 0) > 1}
                    quality={call.quality}
                  />
              ))}
            </div>
            </>
          )}
        </>
      )}
    </OsShell>
  );
}
