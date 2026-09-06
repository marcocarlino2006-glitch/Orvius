"use client";

import { useEffect, useState } from "react";

type Stage = "attention" | "assigning" | "assigned";

const techs = ["Jake M.", "Diana R.", "Chris P."] as const;

type HomeProductPreviewProps = {
  /** Ghost depth behind the hero — no controls, settled shop, never unfinished assign chrome */
  atmosphere?: boolean;
};

/**
 * Product as atmosphere — one attention surface.
 * Marketing mode never shows unfinished line states or interactive chrome.
 */
export function HomeProductPreview({ atmosphere = false }: HomeProductPreviewProps) {
  const [stage, setStage] = useState<Stage>(atmosphere ? "assigned" : "attention");
  const [tech, setTech] = useState<(typeof techs)[number]>(techs[0]);

  useEffect(() => {
    if (atmosphere) {
      // Settled shop loop — never linger on empty / unfinished assign chrome
      let cancelled = false;
      const run = () => {
        if (cancelled) return;
        setStage("attention");
        window.setTimeout(() => {
          if (cancelled) return;
          setTech(techs[Math.floor(Math.random() * techs.length)]!);
          setStage("assigned");
        }, 2600);
      };
      run();
      const loop = window.setInterval(run, 7200);
      return () => {
        cancelled = true;
        window.clearInterval(loop);
      };
    }

    if (stage !== "assigning") return;
    const timer = window.setTimeout(() => setStage("assigned"), 700);
    return () => window.clearTimeout(timer);
  }, [atmosphere, stage]);

  function assign() {
    if (atmosphere || stage !== "attention") return;
    setTech(techs[Math.floor(Math.random() * techs.length)]!);
    setStage("assigning");
  }

  function reset() {
    if (atmosphere) return;
    setStage("attention");
  }

  const statusLine =
    stage === "assigning"
      ? "Routing…"
      : stage === "assigned"
        ? `${tech} · ETA 45 min`
        : atmosphere
          ? "Awaiting dispatch"
          : "Unassigned · today";

  return (
    <div
      className={`mkt-product mkt-product--company ${
        atmosphere ? "mkt-product--atmosphere" : ""
      }`}
    >
      <header className="mkt-product-top">
        <p className="mkt-product-kicker">Board</p>
        <p className="mkt-product-title">
          {stage === "assigned" ? "1 on the board" : "3 on the board"}
        </p>
      </header>

      <ul className="mkt-product-queue">
        <li
          className={`mkt-product-row ${
            stage === "assigned" ? "" : "mkt-product-row-hot"
          }`}
        >
          <span className="mkt-product-row-tag">
            {stage === "assigned" ? "En route" : "Emergency"}
          </span>
          <span className="mkt-product-row-main">
            AC down · 1842 Oak St
            <em>
              {stage === "assigned"
                ? `${tech} · rolling`
                : "Maria Lopez · booked today"}
            </em>
          </span>
        </li>
        <li className="mkt-product-row">
          <span className="mkt-product-row-tag">After hours</span>
          <span className="mkt-product-row-main">
            No hot water · 411 Pine
            <em>Callback captured</em>
          </span>
        </li>
        <li className="mkt-product-row">
          <span className="mkt-product-row-tag">Money</span>
          <span className="mkt-product-row-main">
            Estimate ready · $480
            <em>Await owner send</em>
          </span>
        </li>
      </ul>

      <div className="mkt-product-detail">
        <div>
          <p className="mkt-product-alert-kicker">
            {stage === "assigned" ? "Dispatch" : "Selected"}
          </p>
          <p className="mkt-product-alert-title">Emergency AC · Oak St</p>
          <p className="mkt-product-alert-meta">{statusLine}</p>
        </div>
        {atmosphere ? null : stage === "assigned" ? (
          <button type="button" className="mkt-product-chip" onClick={reset}>
            Replay
          </button>
        ) : (
          <button
            type="button"
            className={`mkt-product-chip ${
              stage === "assigning" ? "mkt-product-chip-busy" : ""
            }`}
            onClick={assign}
            disabled={stage === "assigning"}
            aria-label="Assign technician"
          >
            {stage === "assigning" ? "Routing…" : "Assign tech"}
          </button>
        )}
      </div>
    </div>
  );
}
