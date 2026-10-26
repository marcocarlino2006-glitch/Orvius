"use client";

import { askConfirm } from "@/components/ask-dialog";
import { RecordLink } from "@/components/record-drawer";
import { BookJobQuickButton } from "@/components/today-priority-leads";
import { ProFilterBar, ProEmptyState } from "@/components/pro-page-chrome";
import { ProShopLineCta } from "@/components/pro-shop-line-cta";
import { OsShell } from "@/components/os-shell";
import { DashboardSkeleton } from "@/components/shell-skeleton";
import { StatusDot, type StatusTone } from "@/components/status-dot";
import { toast } from "@/components/toaster";
import { displayPhone, normalizePhone } from "@/lib/customer";
import { formatDay } from "@/lib/when";
import {
  describeDashboardFailure,
  readDashboardError,
  type DashboardLoadFailure,
} from "@/lib/dashboard-fetch";
import { askForMissing, INBOX_VIEWS, INBOX_VIEW_LABEL, type InboxFacts, type InboxView } from "@/lib/inbox-state";
import { inboxBrief } from "@/lib/list-brief";
import { isEmergency, notableUrgency } from "@/lib/urgency";
import { useBusiness } from "@/lib/use-business";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

type LeadRow = {
  id: string;
  name: string | null;
  phone: string | null;
  serviceType: string | null;
  urgency: string | null;
  address: string | null;
  status: string;
  source: string;
  createdAt: string;
  customer: { id: string; interactionCount: number } | null;
  job: { id: string; status: string } | null;
  inbox: InboxFacts;
};

type Filter = "" | InboxView;

const VIEW_TONE: Record<InboxView, StatusTone> = {
  new: "live",
  waiting: "neutral",
  person: "attention",
  resolved: "muted",
};

const EMPTY: Record<Filter, { title: string }> = {
  "": { title: "Nothing open" },
  new: { title: "No new requests" },
  waiting: { title: "Nobody to wait on" },
  person: { title: "Nothing needs a person" },
  resolved: { title: "Nothing resolved yet" },
};

function emptyInbox(filter: Filter, counts: Record<InboxView, number> | null): { body: string; go: "" | "resolved" | "jobs" } {
  const open = counts ? counts.new + counts.waiting + counts.person : 0;
  const resolved = counts?.resolved ?? 0;
  if (filter === "") {
    return { body: "Every open request is handled. Booked and closed ones are under Resolved.", go: "resolved" };
  }
  if (filter === "resolved") {
    return open > 0
      ? { body: "Nothing booked or closed yet. The open requests are under All open.", go: "" }
      : { body: "Nothing booked or closed yet. A new call lands under All open.", go: "" };
  }
  if (open > 0) {
    return { body: "Nothing in this pile. Everything still open is under All open.", go: "" };
  }
  if (resolved > 0) {
    return { body: "Nothing in this pile. What already closed is under Resolved.", go: "resolved" };
  }
  return { body: "A new call or text lands here. The work it becomes is in Jobs.", go: "jobs" };
}

function ago(iso: string, timezone?: string | null) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  return formatDay(iso, new Date(), timezone);
}

function channel(source: string) {
  return source === "sms" ? "Text" : source === "web" ? "Online" : source === "chat" ? "Web chat" : "Call";
}

function detailsText(name: string | null, missing: string[], shop: string) {
  const ask = missing.filter((m) => m !== "callback number").join(" and ");
  return `Hi${name ? ` ${name.split(/\s+/)[0]}` : ""}, this is ${shop}. To get you booked, could you send your ${ask}?`;
}

function InboxRow({ lead, shop, timezone, onChanged }: { lead: LeadRow; shop: string; timezone?: string | null; onChanged: () => void }) {
  const [closing, setClosing] = useState(false);
  const [address, setAddress] = useState("");
  const [savingAddress, setSavingAddress] = useState(false);
  const { inbox } = lead;
  const phone = lead.phone ? normalizePhone(lead.phone) ?? lead.phone : null;
  const notable = notableUrgency(lead.urgency);
  const needsDetails = inbox.missing.filter((m) => m !== "callback number");
  const ask = askForMissing(needsDetails.filter((item) => item !== "address"));
  const open = inbox.view !== "resolved";
  const addressGap = open && !lead.address?.trim();

  async function saveAddress(event: FormEvent) {
    event.preventDefault();
    const line = address.trim();
    if (line.length < 5) return;
    setSavingAddress(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: line }),
      });
      const data = (await res.json().catch(() => null)) as { autoBook?: { created?: boolean; jobId?: string | null } } | null;
      if (!res.ok) throw new Error();
      toast({ title: data?.autoBook?.created ? "Booked. It's on the schedule." : "Address saved" });
      onChanged();
    } catch {
      toast({ title: "That address didn't save. The request is still open.", tone: "error" });
    } finally {
      setSavingAddress(false);
    }
  }

  async function close() {
    if (!(await askConfirm({ title: "Close this request without booking?", body: "It moves to Resolved.", confirmLabel: "Close request" }))) return;
    setClosing(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "lost" }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Request closed" });
      onChanged();
    } catch {
      toast({ title: "That didn't save. The request is still open.", tone: "error" });
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="dt-row" role="row">
      <span role="cell" className="dt-primary">
        <span className="dt-title">
          {isEmergency(lead.urgency) ? <span className="dt-flag">Emergency</span> : null}
          <RecordLink type="lead" id={lead.id} href={`/dashboard/inbox/${lead.id}`} className="dt-link">
            {lead.name ?? (phone ? displayPhone(phone) : "Unknown caller")}
          </RecordLink>
          {(lead.customer?.interactionCount ?? 0) > 1 ? <span className="dt-tag">Returning</span> : null}
        </span>
        <span className="dt-sub">
          {[lead.serviceType ?? "Didn't say what they need", channel(lead.source) !== "Call" ? channel(lead.source) : null, lead.address]
            .filter(Boolean)
            .join(", ")}
        </span>
        {open && ask && inbox.reason !== ask ? <span className="dt-attention">{ask}</span> : null}
        {addressGap ? (
          <form className="dt-address" onSubmit={(event) => void saveAddress(event)}>
            <input
              className="dt-address-input"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Street address"
              aria-label={`Address for ${lead.name ?? "this caller"}`}
              maxLength={240}
            />
            <button type="submit" className="lead-quick-btn lead-quick-btn-primary" disabled={savingAddress || address.trim().length < 5}>
              {savingAddress ? "Saving…" : lead.serviceType ? "Save and book" : "Save address"}
            </button>
          </form>
        ) : null}
      </span>
      <span role="cell">
        <StatusDot tone={VIEW_TONE[inbox.view]}>{INBOX_VIEW_LABEL[inbox.view]}</StatusDot>
        {addressGap ? null : <span className="dt-sub">{inbox.reason}</span>}
        {notable && !isEmergency(lead.urgency) ? <span className="dt-sub">{notable.charAt(0).toUpperCase() + notable.slice(1)}</span> : null}
      </span>
      <span role="cell" className="dt-when">
        <span>{inbox.lastContact.label}</span>
        <time className="dt-sub" dateTime={inbox.lastContact.at}>
          {ago(inbox.lastContact.at, timezone)}
        </time>
      </span>
      <span role="cell" className="dt-actions">
        <div className="lead-quick-actions font-sans">
          {lead.job ? (
            <RecordLink type="job" id={lead.job.id} href={`/dashboard/jobs/${lead.job.id}`} className="lead-quick-btn">
              Open the job
            </RecordLink>
          ) : !open ? (
            <RecordLink type="lead" id={lead.id} href={`/dashboard/inbox/${lead.id}`} className="lead-quick-btn">
              Review
            </RecordLink>
          ) : (
            <>
              {phone && needsDetails.length ? (
                <a href={`sms:${phone}?&body=${encodeURIComponent(detailsText(lead.name, needsDetails, shop))}`} className="lead-quick-btn">
                  Text for details
                </a>
              ) : null}
              {phone ? (
                <a href={`tel:${phone}`} className={`lead-quick-btn${inbox.view === "person" ? " lead-quick-btn-primary" : ""}`}>
                  Call
                </a>
              ) : null}
              {lead.address && lead.serviceType ? (
                <BookJobQuickButton leadId={lead.id} onBooked={onChanged} className="lead-quick-btn lead-quick-btn-primary" />
              ) : null}
              <button type="button" className="lead-quick-btn" disabled={closing} onClick={() => void close()}>
                {closing ? "Closing…" : "Close"}
              </button>
            </>
          )}
        </div>
      </span>
    </div>
  );
}

export default function InboxPage() {
  const { business } = useBusiness();
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [counts, setCounts] = useState<Record<InboxView, number> | null>(null);
  const [filter, setFilter] = useState<Filter>("");
  const [failure, setFailure] = useState<DashboardLoadFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [timeZone, setTimeZone] = useState<string | null>(null);

  const load = useCallback(async (view: Filter) => {
    setLoading(true);
    setFailure(null);
    try {
      const res = await fetch(`/api/leads?view=${view}`, { cache: "no-store" });
      if (!res.ok) {
        setFailure(await readDashboardError("Inbox", res));
        return;
      }
      const data = (await res.json()) as { leads: LeadRow[]; views: Record<InboxView, number>; truncated: boolean; generatedAt: string; timezone?: string | null };
      setLeads(data.leads ?? []);
      setCounts(data.views ?? null);
      setTruncated(Boolean(data.truncated));
      setLoadedAt(data.generatedAt);
      setTimeZone(data.timezone ?? null);
    } catch {
      setFailure(describeDashboardFailure("Inbox", null, "Network error"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  const openCount = counts ? counts.new + counts.waiting + counts.person : undefined;
  const nothingEver = counts !== null && openCount === 0 && counts.resolved === 0;

  return (
    <OsShell
      title="Inbox"
      subtitle={loadedAt ? `Updated ${ago(loadedAt, timeZone)}` : undefined}
      actions={
        <Link href="/dashboard/inbox/messages" className="btn btn-secondary text-sm">
          Messages
        </Link>
      }
    >
      <p className="pg-purpose font-sans">
        {inboxBrief(counts)}
        {counts && counts.new + counts.waiting + counts.person === 0 ? (
          <>
            {" "}
            <Link href="/dashboard/jobs">Open Jobs</Link>
          </>
        ) : null}
      </p>

      <ProFilterBar
        className="pro-page-filters"
        value={filter}
        onChange={(v) => setFilter(v as Filter)}
        options={[
          { value: "", label: "All open", count: openCount },
          ...INBOX_VIEWS.map((v) => ({ value: v, label: INBOX_VIEW_LABEL[v], count: counts?.[v] })),
        ]}
      />

      {failure ? (
        <div className="mb-6 pro-alert pro-alert-error font-sans" role="alert">
          <p className="font-medium">{failure.title}</p>
          <p className="mt-2 text-sm opacity-90">{failure.cause} {failure.recovery}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-void text-sm" onClick={() => void load(filter)}>
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {loading && !leads.length ? (
        <DashboardSkeleton />
      ) : failure && !leads.length ? null : nothingEver ? (
        <ProEmptyState
          title="No requests yet"
          body="When someone calls, texts or writes in, Orvius writes down who they are, what they need and how urgent it is, and the request lands here. Place a test call to see one."
          action={<ProShopLineCta showNumber={false} />}
        />
      ) : !leads.length ? (
        <InboxEmpty filter={filter} counts={counts} onFilter={setFilter} />
      ) : (
        <>
          <div className="dt dt--leads dt--inbox font-sans" role="table" aria-label="Requests">
            <div className="dt-head" role="row">
              <span role="columnheader">Customer and problem</span>
              <span role="columnheader">Where it stands</span>
              <span role="columnheader">Last contact</span>
              <span role="columnheader" className="dt-num">
                <span className="sr-only">Actions</span>
              </span>
            </div>
            {leads.map((lead) => (
              <InboxRow key={lead.id} lead={lead} shop={business?.name ?? "us"} timezone={timeZone} onChanged={() => void load(filter)} />
            ))}
          </div>
          {truncated ? <p className="dt-foot">Showing the 300 newest open requests.</p> : null}
        </>
      )}
    </OsShell>
  );
}

function InboxEmpty({
  filter,
  counts,
  onFilter,
}: {
  filter: Filter;
  counts: Record<InboxView, number> | null;
  onFilter: (next: Filter) => void;
}) {
  const empty = emptyInbox(filter, counts);
  const action =
    empty.go === "jobs" ? (
      <Link href="/dashboard/jobs" className="btn btn-secondary text-sm">
        Open Jobs
      </Link>
    ) : empty.go === "resolved" ? (
      <button type="button" className="btn btn-secondary text-sm" onClick={() => onFilter("resolved")}>
        Resolved
      </button>
    ) : (
      <button type="button" className="btn btn-secondary text-sm" onClick={() => onFilter("")}>
        All open
      </button>
    );
  return <ProEmptyState title={EMPTY[filter].title} body={empty.body} action={action} />;
}
