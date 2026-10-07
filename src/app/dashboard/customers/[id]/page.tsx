"use client";

import { CustomerTimeline } from "@/components/customer-timeline";
import { OsShell } from "@/components/os-shell";
import { ShellAlert, ShellLoading } from "@/components/shell-primitives";
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) return;

    fetch(`/api/customers/${customerId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Customer not found");
        return res.json();
      })
      .then((data) => {
        setCustomer(data.customer);
        setTimeline(data.timeline ?? []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [customerId]);

  if (loading) {
    return (
      <OsShell title="Customer" subtitle="Loading record…">
        <ShellLoading />
      </OsShell>
    );
  }

  if (error || !customer) {
    return (
      <OsShell title="Customer" subtitle="Record not found">
        <ShellAlert tone="error">{error ?? "Not found"}</ShellAlert>
        <Link href="/dashboard/customers" className="customer-timeline-link mt-4 inline-block font-sans">
          ← All customers
        </Link>
      </OsShell>
    );
  }

  const paidCents = timeline.filter((e) => e.type === "payment" && (e.status ?? "").toLowerCase() !== "failed").reduce((sum, e) => sum + (e.amountCents ?? 0), 0);
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
      <div className="os-detail-grid rec-page">
        <div className="os-detail-primary">
          <section className="rec">
            <header className="rec-head">
              <h2 className="rec-title">Profile</h2>
              {customer.returning ? <span className="ct-kind ct-kind--money">Returning</span> : null}
            </header>
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
            <CustomerRecordEditor
              customerId={customer.id}
              addresses={customer.addresses ?? []}
              equipment={customer.equipment ?? []}
              onSaved={(next) => setCustomer((c) => (c ? { ...c, ...next } : c))}
            />
          </section>
        </div>

        <div className="os-detail-side">
          <section className="rec">
            <header className="rec-head">
              <h2 className="rec-title">History</h2>
            </header>
            <CustomerTimeline events={timeline} />
          </section>
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
  const [open, setOpen] = useState<null | "address" | "equipment">(null);
  const [line, setLine] = useState("");
  const [label, setLabel] = useState("Rental");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(null);
    setLine("");
    setLabel("Rental");
    setName("");
    setBrand("");
    setError(null);
  }

  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${customerId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "That didn't save.");
      onSaved({ addresses: data.addresses ?? addresses, equipment: data.equipment ?? equipment });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rec-add">
      {open === "address" ? (
        <form
          className="rec-inline font-sans"
          onSubmit={(e) => {
            e.preventDefault();
            if (!line.trim()) return;
            void save({ addresses: [...addresses, { label, line: line.trim() }] });
          }}
        >
          <input
            className="rec-field"
            value={line}
            onChange={(e) => setLine(e.target.value)}
            placeholder="4120 Duval St, Austin"
            aria-label="Address"
            autoFocus
          />
          <input
            className="rec-field rec-field--short"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Home, rental…"
            aria-label="What this address is"
          />
          <button type="submit" className="ox-btn ox-btn--primary ox-btn--sm" disabled={busy || !line.trim()}>
            Save
          </button>
          <button type="button" className="rec-cancel" onClick={close}>
            Cancel
          </button>
        </form>
      ) : open === "equipment" ? (
        <form
          className="rec-inline font-sans"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            void save({ equipment: [...equipment, { name: name.trim(), brand: brand.trim(), model: "", notes: "" }] });
          }}
        >
          <input
            className="rec-field rec-field--short"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Furnace"
            aria-label="Equipment"
            autoFocus
          />
          <input
            className="rec-field rec-field--short"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Carrier"
            aria-label="Brand"
          />
          <button type="submit" className="ox-btn ox-btn--primary ox-btn--sm" disabled={busy || !name.trim()}>
            Save
          </button>
          <button type="button" className="rec-cancel" onClick={close}>
            Cancel
          </button>
        </form>
      ) : (
        <p className="rec-add-links">
          <button type="button" className="rec-add-link" onClick={() => setOpen("address")}>
            Add address
          </button>
          <button type="button" className="rec-add-link" onClick={() => setOpen("equipment")}>
            Add equipment
          </button>
        </p>
      )}
      {error ? <p className="cb-error">{error}</p> : null}
    </div>
  );
}
