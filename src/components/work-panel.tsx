"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "@/components/toaster";
import { WorkCard } from "@/components/work-card";
import type { WorkItem, WorkStage } from "@/lib/work";
import { WorkHistory } from "@/components/work-history-view";
import type { HistoryEvent } from "@/lib/work-history";

type Payload = {
  item: WorkItem;
  history: HistoryEvent[];
  assignees: Array<{ email: string; role: string }>;
  technicians: Array<{ id: string; name: string }>;
};

const TRACK = ["Request", "Booked", "Confirmed", "On the way", "On site", "Done"] as const;

function trackStep(item: WorkItem): number {
  const byStage: Record<WorkStage, number> = {
    needs_callback: 0,
    needs_time: item.kind === "job" ? 1 : 0,
    scheduled: 1,
    confirmed: 2,
    on_the_way: 3,
    on_site: 4,
    done: 5,
    cancelled: -1,
    spam: -1,
  };
  return byStage[item.stage];
}

function StageTrack({ item }: { item: WorkItem }) {
  const step = trackStep(item);
  if (step < 0) {
    return <p className="wp-closed">{item.stage === "spam" ? "Marked spam" : "Cancelled"} — nothing else happens to this work.</p>;
  }
  return (
    <ol className="wp-track" aria-label={`Stage: ${item.stageLabel}`}>
      {TRACK.map((label, i) => (
        <li key={label} className={`wp-step${i < step ? " is-done" : ""}${i === step ? " is-now" : ""}`} aria-current={i === step ? "step" : undefined}>
          <span className="wp-step-dot" aria-hidden />
          <span className="wp-step-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The top of every request and job page: where the work stands, what is wrong,
 * what happens next and who has it. A request and the job it becomes show the
 * same panel, so booking reads as the work moving forward.
 */
export function WorkPanel({
  kind,
  id,
  onChange,
  refreshKey = 0,
  children,
}: {
  kind: "request" | "job";
  id: string;
  onChange?: () => void;
  /** Bump when the page changes the work itself, so the panel and history re-read. */
  refreshKey?: number;
  /** Page-specific detail, shown between where the work stands and its history. */
  children?: ReactNode;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/work/item?kind=${kind}&id=${encodeURIComponent(id)}`);
    if (!res.ok) {
      setError("Couldn't load where this work stands.");
      return;
    }
    setError(null);
    setData((await res.json()) as Payload);
  }, [kind, id]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const changed = useCallback(() => {
    void load();
    onChange?.();
  }, [load, onChange]);

  async function assign(email: string | null) {
    if (!data) return;
    const res = await fetch("/api/work", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: data.item.kind, id: data.item.id, email }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast({ title: body.error ?? "Couldn't change who is responsible.", tone: "error" });
      return;
    }
    toast({ title: email ? `${email} is responsible` : "Back with you" });
    void load();
  }

  if (error) {
    return (
      <div className="wp-stack">
        <p className="cb-error" role="alert">{error}</p>
        {children}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="wp-stack">
        <div className="wp wp--loading" aria-busy>
          <span className="skeleton" style={{ width: "60%", height: 14 }} />
          <span className="skeleton" style={{ width: "35%", height: 12 }} />
        </div>
        {children}
      </div>
    );
  }

  const { item } = data;
  const movedOn = kind === "request" && item.kind === "job";
  return (
    <div className="wp-stack">
      <section className="wp" aria-label="Where this work stands">
        <StageTrack item={item} />
        {movedOn ? (
          <p className="wp-moved">
            This request is booked. <Link href={item.href}>Open the job →</Link>
          </p>
        ) : null}
        <div className="wp-owner">
          <label className="wp-owner-label" htmlFor={`wp-owner-${item.key}`}>
            Responsible
          </label>
          <select
            id={`wp-owner-${item.key}`}
            className="wc-select"
            value={item.responsible.email ?? ""}
            onChange={(e) => void assign(e.target.value || null)}
          >
            <option value="">{item.responsible.kind === "technician" ? `${item.responsible.label} (technician)` : "You (owner)"}</option>
            {data.assignees
              .filter((a) => a.role !== "owner")
              .map((a) => (
                <option key={a.email} value={a.email}>
                  {a.email}
                </option>
              ))}
          </select>
        </div>
        <ul className="wc-list">
          <WorkCard item={item} technicians={data.technicians} onChange={changed} variant="page" />
        </ul>
      </section>
      {children}
      <WorkHistory events={data.history} />
    </div>
  );
}
