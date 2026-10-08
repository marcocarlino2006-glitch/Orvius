"use client";

import { CustomerTimeline } from "@/components/customer-timeline";
import { RecordFetchError, recordFailureFrom } from "@/lib/dashboard-fetch";
import { RecordLoadFailure } from "@/components/record-load-failure";
import { OsShell } from "@/components/os-shell";
import {
  ShellAlert,
  ShellLoading,
  ShellPanel,
} from "@/components/shell-primitives";
import { displayPhone } from "@/lib/customer";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatDay, formatWhen } from "@/lib/when";

function usd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

type CustomerDetail = {
  id: string;
  displayName: string;
  name: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  addresses: Array<{ label: string; line: string }>;
  equipment: Array<{ name: string; brand: string; model: string; notes: string }>;
  notes: string | null;
  interactionCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  returning: boolean;
  business: { id: string; name: string } | null;
  leadCount: number;
  callCount: number;
  jobCount: number;
};

type TimelineEvent = {
  id: string;
  type: "call" | "lead" | "job" | "estimate" | "invoice" | "payment" | "text";
  at: string;
  title: string;
  summary: string | null;
  source: string | null;
  urgency: string | null;
  status: string | null;
  amountCents?: number | null;
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [failure, setFailure] = useState<ReturnType<typeof recordFailureFrom> | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!customerId) return;

    fetch(`/api/customers/${customerId}`)
      .then(async (res) => {
        if (!res.ok) throw new RecordFetchError(res.status);
        return res.json();
      })
      .then((data) => {
        setCustomer(data.customer);
        setTimeline(data.timeline ?? []);
        setFailure(null);
      })
      .catch((err) => setFailure(recordFailureFrom("customer", err)))
      .finally(() => setLoading(false));
  }, [customerId, attempt]);

  if (loading) {
    return (
      <OsShell title="Customer" subtitle="Loading record…">
        <ShellLoading />
      </OsShell>
    );
  }

  if (failure || !customer) {
    return (
      <OsShell title="Customer" subtitle={failure?.status === 404 ? "Not on this account" : "Couldn't load"}>
        <RecordLoadFailure
          failure={failure ?? recordFailureFrom("customer", null)}
          backHref="/dashboard/customers"
          backLabel="All customers"
          onRetry={() => {
            setLoading(true);
            setAttempt((n) => n + 1);
          }}
        />
      </OsShell>
    );
  }

  const paidCents = timeline.filter((e) => e.type === "payment" && !["failed", "claimed", "refunded"].includes((e.status ?? "").toLowerCase())).reduce((sum, e) => sum + (e.amountCents ?? 0), 0);
  const summary = [
    `Customer since ${formatDay(customer.firstSeenAt)}`,
    `${customer.callCount} call${customer.callCount === 1 ? "" : "s"}`,
    `${customer.jobCount ?? 0} job${customer.jobCount === 1 ? "" : "s"}`,
    paidCents ? `${usd(paidCents)} paid` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <OsShell
      title={customer.displayName}
      subtitle={summary}
      actions={
        customer.phone ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/dashboard/inbox/messages?phone=${encodeURIComponent(customer.phone)}`}
              className="ox-btn ox-btn--quiet ox-btn--sm"
            >
              Text
            </Link>
            <Link
              href={`/dashboard/jobs/new?${new URLSearchParams({
                phone: customer.phone,
                ...(customer.name ? { name: customer.name } : {}),
                ...(customer.address ? { address: customer.address } : {}),
              })}`}
              className="ox-btn ox-btn--quiet ox-btn--sm"
            >
              Book a job
            </Link>
            <a href={`tel:${customer.phone}`} className="ox-btn ox-btn--primary ox-btn--sm">
              Call
            </a>
          </div>
        ) : null
      }
    >
      <div className="os-detail-grid">
        <div className="os-detail-primary">
          <ShellPanel title="Profile" dense action={customer.returning ? <span className="ct-kind ct-kind--money">Returning</span> : null}>
            <dl className="jv-facts font-sans">
              <div>
                <dt>Phone</dt>
                <dd className="tabular-nums">{displayPhone(customer.phone)}</dd>
              </div>
              {customer.email ? (
                <div>
                  <dt>Email</dt>
                  <dd>{customer.email}</dd>
                </div>
              ) : null}
              <div>
                <dt>Address</dt>
                <dd className={customer.address ? undefined : "jv-missing"}>{customer.address ?? "None on file"}</dd>
              </div>
              {customer.addresses?.length ? (
                <div>
                  <dt>Also at</dt>
                  <dd>
                    {customer.addresses.map((row) => (
                      <p key={row.line} style={{ margin: "0 0 0.25rem" }}>
                        {row.label ? `${row.label}: ` : ""}
                        {row.line}
                      </p>
                    ))}
                  </dd>
                </div>
              ) : null}
              {customer.equipment?.length ? (
                <div>
                  <dt>Equipment</dt>
                  <dd>
                    {customer.equipment.map((row) => (
                      <p key={`${row.name}-${row.model}`} style={{ margin: "0 0 0.25rem" }}>
                        {[row.brand, row.name, row.model].filter(Boolean).join(" ")}
                        {row.notes ? ` — ${row.notes}` : ""}
                      </p>
                    ))}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Last heard from</dt>
                <dd>{formatWhen(customer.lastSeenAt)}</dd>
              </div>
              {customer.notes ? (
                <div>
                  <dt>Notes</dt>
                  <dd className="jv-notes">{customer.notes}</dd>
                </div>
              ) : null}
            </dl>
          </ShellPanel>
          <CustomerRecordEditor customerId={customer.id} addresses={customer.addresses ?? []} equipment={customer.equipment ?? []} onSaved={(next) => setCustomer((c) => (c ? { ...c, ...next } : c))} />
        </div>

        <div className="os-detail-side">
          <ShellPanel title="History" dense>
            <CustomerTimeline events={timeline} />
          </ShellPanel>
        </div>
      </div>
    </OsShell>
  );
}

function CustomerRecordEditor({
  customerId,
  addresses,
  equipment,
  onSaved,
}: {
  customerId: string;
  addresses: Array<{ label: string; line: string }>;
  equipment: Array<{ name: string; brand: string; model: string; notes: string }>;
  onSaved: (next: { addresses: Array<{ label: string; line: string }>; equipment: Array<{ name: string; brand: string; model: string; notes: string }> }) => void;
}) {
  const [line, setLine] = useState("");
  const [label, setLabel] = useState("Rental");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${customerId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "That didn't save.");
      onSaved({ addresses: data.addresses ?? addresses, equipment: data.equipment ?? equipment });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ShellPanel title="Add to this record" dense>
      <form
        className="jv-facts font-sans"
        onSubmit={(e) => {
          e.preventDefault();
          if (!line.trim()) return;
          void save({ addresses: [...addresses, { label, line: line.trim() }] }).then(() => setLine(""));
        }}
      >
        <label>
          Another address
          <input className="sc-input" value={line} onChange={(e) => setLine(e.target.value)} placeholder="4120 Duval St, Austin" />
        </label>
        <label>
          What it is
          <input className="sc-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Rental" />
        </label>
        <button type="submit" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy || !line.trim()}>
          Save address
        </button>
      </form>
      <form
        className="jv-facts font-sans"
        style={{ marginTop: "1rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void save({ equipment: [...equipment, { name: name.trim(), brand: brand.trim(), model: "", notes: "" }] }).then(() => {
            setName("");
            setBrand("");
          });
        }}
      >
        <label>
          Equipment
          <input className="sc-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Furnace" />
        </label>
        <label>
          Brand
          <input className="sc-input" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Carrier" />
        </label>
        <button type="submit" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy || !name.trim()}>
          Save equipment
        </button>
      </form>
      {error ? <p className="cb-error">{error}</p> : null}
    </ShellPanel>
  );
}
