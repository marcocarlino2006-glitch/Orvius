"use client";

import { useCallback, useEffect, useState } from "react";
import { OsShell } from "@/components/os-shell";
import { ShellPanel } from "@/components/shell-primitives";

type Pending = { id: string; shopName: string; trade: string; sharedByEmail: string; createdAt: string; turns: Array<{ who: "ai" | "caller"; text: string }> };

/** Founder review: read every shared call before strangers can. */
export default function GalleryReviewPage() {
  const [rows, setRows] = useState<Pending[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/gallery", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 401 ? "Only Orvius admins can review the gallery." : "Couldn't load the calls waiting for review.");
        return res.json() as Promise<{ pending: Pending[] }>;
      })
      .then((data) => setRows(data.pending))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  async function decide(id: string, decision: "listed" | "removed") {
    const res = await fetch("/api/admin/gallery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, decision }) });
    if (!res.ok) return setError("That didn't save. Try again.");
    setRows((r) => r?.filter((row) => row.id !== id) ?? null);
  }

  return (
    <OsShell title="Gallery review" subtitle="Real calls shops sent for the public gallery. Read for anything that identifies the caller before listing.">
      {error ? <p className="jv-sub font-sans" role="alert">{error}</p> : null}
      {rows && rows.length === 0 ? <p className="jv-sub font-sans">Nothing waiting for review.</p> : null}
      {rows?.map((row) => (
        <ShellPanel key={row.id} title={`${row.shopName} · ${row.trade}`} dense action={<span className="cl-source font-sans">Shared by {row.sharedByEmail}</span>}>
          <ol className="cgs-turns font-sans">
            {row.turns.map((t, i) => (
              <li key={i}>
                <strong>{t.who === "ai" ? row.shopName : "Caller"}:</strong> {t.text}
              </li>
            ))}
          </ol>
          <div className="cgs-actions mt-3">
            <button type="button" className="ov-btn ov-btn--solid" onClick={() => decide(row.id, "listed")}>
              List it
            </button>
            <button type="button" className="ov-btn ov-btn--quiet" onClick={() => decide(row.id, "removed")}>
              Keep it off
            </button>
          </div>
        </ShellPanel>
      ))}
    </OsShell>
  );
}
