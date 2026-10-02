"use client";

import { useEffect, useState } from "react";
import { ScGroup, ScRow } from "./settings-primitives";

type State = { link: string; terms: string; pending: number; credited: number; creditedCents: number };

export function ReferGroup() {
  const [state, setState] = useState<State | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    void fetch("/api/account/referrals", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<State>) : null))
      .then((next) => {
        if (live && next) setState(next);
      })
      .catch(() => null);
    return () => {
      live = false;
    };
  }, []);

  if (!state) return null;

  async function copy() {
    if (!state) return;
    try {
      await navigator.clipboard.writeText(state.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const tally =
    state.pending || state.credited
      ? `${state.credited} credited ($${Math.round(state.creditedCents / 100)})${state.pending ? ` · ${state.pending} not paid yet` : ""}`
      : "No shops from your link yet";

  return (
    <ScGroup title="Refer a shop">
      <ScRow label="Your link" hint={state.terms} stack>
        <div className="sc-inline-field">
          <span className="sc-value sc-refer-link">{state.link.replace(/^https:\/\//, "")}</span>
          <button type="button" className="sc-btn" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </ScRow>
      <ScRow label="Shops you sent">
        <span className="sc-value">{tally}</span>
      </ScRow>
    </ScGroup>
  );
}
