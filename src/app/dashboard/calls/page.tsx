"use client";

import { CallRecordCard, CallTableHead } from "@/components/call-record-card";
import { ProLead } from "@/components/pro-lead";
import { ProEmptyState, ProFilterBar } from "@/components/pro-page-chrome";
import { ProShopLineCta } from "@/components/pro-shop-line-cta";
import { OsShell } from "@/components/os-shell";
import { DashboardSkeleton } from "@/components/shell-skeleton";
import { CALL_OUTCOMES, CALL_OUTCOME_LABEL, type CallOutcome } from "@/lib/call-outcome";
import type { CallVerdict } from "@/lib/call-quality";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  outcome: CallOutcome;
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

type Filter = "" | CallOutcome | "review";

export default function CallsPage() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("");
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  const load = useCallback((q: string) => {
    setLoading(true);
    setError(null);
    fetch(`/api/calls?limit=100${q ? `&q=${encodeURIComponent(q)}` : ""}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 401 ? "Your session expired. Sign in again." : "Calls didn't load. Your line is still answering; try again.");
        return res.json();
      })
      .then((data) => {
        setCalls(data.calls ?? []);
        setSearched(q);
        setLoadedAt(Date.now());
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load("");
  }, [load]);

  useEffect(() => {
    const q = query.trim();
    if (q === searched) return;
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [query, searched, load]);

  const counts = useMemo(() => {
    const out: Record<string, number> = { "": calls.length, review: 0 };
    for (const o of CALL_OUTCOMES) out[o] = 0;
    for (const call of calls) {
      out[call.outcome] = (out[call.outcome] ?? 0) + 1;
      if (call.quality?.verdict !== "clean") out.review += 1;
    }
    return out;
  }, [calls]);
  const shown = calls.filter((call) =>
    filter === "" ? true : filter === "review" ? call.quality?.verdict !== "clean" : call.outcome === filter,
  );
  const afterHours = calls.filter((call) => call.afterHours).length;

  return (
    <OsShell
      title="Calls"
      subtitle={loadedAt ? `What happened on the phone · updated ${new Date(loadedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : "What happened on the phone"}
    >
      <ProLead
        loading={loading && !calls.length}
        figure={String(calls.length)}
        caption={searched ? `Calls matching "${searched}"` : "Latest calls"}
        facts={[
          { label: "Booked", value: counts.booked ?? 0 },
          { label: "Safety", value: counts.safety ?? 0, live: (counts.safety ?? 0) > 0 },
          { label: "After hours", value: afterHours },
        ]}
        action={<ProShopLineCta label="Test call" showNumber={false} />}
      />

      {error ? (
        <div className="ox-state ox-state--failure ox-state--inline" role="alert">
          <p className="ox-state-title">Calls not updated</p>
          <p className="ox-state-copy">{error}</p>
          <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => load(query.trim())}>
            Retry
          </button>
        </div>
      ) : null}

      {loading && !calls.length ? (
        <DashboardSkeleton />
      ) : !calls.length && !searched ? (
        error ? null : (
          <ProEmptyState
            title="No calls yet"
            body="Each call shows who called, how long it lasted and what came of it, with the recording and transcript when they're available. Place a test call to see one."
            action={<ProShopLineCta showNumber={false} />}
          />
        )
      ) : (
        <>
          <input
            type="search"
            className="input pg-search font-sans"
            placeholder="Search by caller, number or what they said"
            aria-label="Search calls"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ProFilterBar
            className="mb-4"
            value={filter}
            onChange={(value) => setFilter(value as Filter)}
            options={[
              { value: "", label: "All", count: counts[""] },
              ...CALL_OUTCOMES.map((o) => ({ value: o, label: CALL_OUTCOME_LABEL[o], count: counts[o] })),
              { value: "review", label: "Worth a listen", count: counts.review },
            ]}
          />
          {!shown.length ? (
            <ProEmptyState
              title={searched && !calls.length ? `No calls match "${searched}"` : "Nothing in this filter"}
              body={searched && !calls.length ? "Try a name, part of a phone number, or a word the caller used." : "Pick another outcome."}
            />
          ) : (
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
                  leadName={call.lead?.name ?? call.customer?.name}
                  serviceType={call.lead?.serviceType}
                  urgency={call.lead?.urgency}
                  returning={(call.customer?.interactionCount ?? 0) > 1}
                  quality={call.quality}
                  outcome={call.outcome}
                />
              ))}
            </div>
          )}
        </>
      )}
    </OsShell>
  );
}
