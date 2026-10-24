"use client";

import { useCallback, useEffect, useState } from "react";
import { PortRequestForm } from "@/components/port-request-form";
import { StatusDot } from "@/components/status-dot";
import { displayPhone } from "@/lib/customer";

type Connection = {
  line: string | null;
};

/**
 * The receptionist answers the number we assigned. Moving a number the shop
 * already has is a port we file. The owner does not dial a carrier code.
 */
export function ConnectNumber({ onConfirmManually: _onConfirmManually }: { onConfirmManually?: (next: boolean) => Promise<void> | void }) {
  const [line, setLine] = useState<string | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/account/connection", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as Connection;
      setLine(data.line);
    } catch {
      setLoadError("Your number didn't load. Nothing changed.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadError) {
    return (
      <div className="cn font-sans" role="alert">
        <p className="cn-error">{loadError}</p>
        <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }
  if (line === undefined) {
    return (
      <div className="cn font-sans" aria-busy>
        <span className="skeleton cn-skel" />
        <span className="skeleton cn-skel" />
      </div>
    );
  }

  return (
    <div className="cn font-sans">
      <div className="cn-health cn-health--proven" role="status">
        <StatusDot tone="good">{line ? "On" : "Not on yet"}</StatusDot>
        <span className="cn-muted">
          {line ? "Your receptionist answers this number." : "Your number is assigned when you go live. The receptionist answers it."}
        </span>
      </div>

      {line ? (
        <p className="cn-row">
          <a href={`tel:${line}`} className="ox-btn ox-btn--primary ox-btn--sm">
            Call {displayPhone(line)}
          </a>
        </p>
      ) : null}

      <div className="cn-more">
        <p className="cn-step-title">Use a number you already have</p>
        <p className="cn-muted">
          We file the move with your carrier. This number keeps answering until the move is done.
        </p>
        <PortRequestForm />
      </div>
    </div>
  );
}
