"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Capability } from "@/lib/capabilities";
import { ScGroup } from "./settings-primitives";

const STATE_LABEL: Record<Capability["state"], string> = {
  ready: "On",
  pending: "Waiting",
  off: "Off",
};

/**
 * What the shop asked for beside what is actually running. Read from the
 * server each time it opens and after each save, so a saved setting that a
 * prerequisite still holds back reads "Waiting", never "On".
 */
export function CapabilitiesGroup({ refreshKey }: { refreshKey?: unknown }) {
  const [caps, setCaps] = useState<Capability[] | null>(null);
  const [failed, setFailed] = useState<"error" | "signed_out" | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    const res = await fetch("/api/capabilities", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) {
      setFailed(res?.status === 401 ? "signed_out" : "error");
      return;
    }
    const data = (await res.json()) as { capabilities: Capability[] };
    setCaps(data.capabilities);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <ScGroup title="What's on right now">
      {failed ? (
        <div className="sc-banner sc-banner--error" role="alert">
          {failed === "signed_out" ? "You're signed out, so this can't be checked. " : "Couldn't check what's on. Nothing here is assumed on. "}
          {failed === "signed_out" ? (
            <a href={`/login?callbackUrl=${encodeURIComponent("/dashboard?settings=receptionist")}`}>Sign in</a>
          ) : (
            <button type="button" className="sc-btn" onClick={() => void load()}>
              Try again
            </button>
          )}
        </div>
      ) : caps === null ? (
        <p className="sc-muted sc-pad" aria-busy="true">
          Checking…
        </p>
      ) : (
        caps.map((cap) => (
          <div key={cap.id} className="sc-row sc-row--stack sc-capability" data-state={cap.state}>
            <div className="sc-row-copy">
              <p className="sc-row-label">
                {cap.label} <span className={`sc-pill${cap.state === "ready" && !cap.simulated ? " is-on" : ""}`}>{cap.simulated ? "Simulated" : STATE_LABEL[cap.state]}</span>
              </p>
              <p className="sc-row-hint">{cap.detail}</p>
              {cap.meanwhile ? <p className="sc-row-hint">{cap.meanwhile}</p> : null}
              {cap.requested && cap.state !== "off" ? (
                <ul className="sc-capability-facts">
                  {cap.facts.map((fact) => (
                    <li key={fact.label} data-ok={fact.ok === null ? "unknown" : String(fact.ok)}>
                      <span aria-hidden="true">{fact.ok === true ? "✓" : fact.ok === false ? "✕" : "–"}</span>{" "}
                      <span className="sr-only">{fact.ok === true ? "Done:" : fact.ok === false ? "Missing:" : "Not needed or unknown:"}</span> {fact.label}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {cap.fixHref && cap.state === "pending" ? (
              <div className="sc-row-control">
                <Link href={cap.fixHref} className="sc-btn">
                  Fix this
                </Link>
              </div>
            ) : null}
          </div>
        ))
      )}
    </ScGroup>
  );
}
