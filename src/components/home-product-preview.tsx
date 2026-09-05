"use client";

import { useEffect, useState } from "react";

type Stage = "attention" | "assigning" | "assigned";

const techs = ["Jake M.", "Diana R.", "Chris P."] as const;

/**
 * Product as atmosphere — one attention surface.
 * No browser chrome, KPI strip, or chip theater.
 */
export function HomeProductPreview() {
  const [stage, setStage] = useState<Stage>("attention");
  const [tech, setTech] = useState<(typeof techs)[number]>(techs[0]);

  useEffect(() => {
    if (stage !== "assigning") return;
    const timer = window.setTimeout(() => setStage("assigned"), 700);
    return () => window.clearTimeout(timer);
  }, [stage]);

  function assign() {
    if (stage !== "attention") return;
    setTech(techs[Math.floor(Math.random() * techs.length)]);
    setStage("assigning");
  }

  function reset() {
    setStage("attention");
  }

  return (
    <div className="mkt-product mkt-product--company">
      <header className="mkt-product-top">
        <p className="mkt-product-kicker">Command</p>
        <p className="mkt-product-title">
          {stage === "assigned" ? "1 needs you" : "3 need you"}
        </p>
      </header>

      <ul className="mkt-product-queue">
        <li
          className={`mkt-product-row ${
            stage === "assigned" ? "" : "mkt-product-row-hot"
          }`}
        >
          <span className="mkt-product-row-tag">
            {stage === "assigned" ? "Assigned" : "Emergency"}
          </span>
          <span className="mkt-product-row-main">
            AC down · 1842 Oak St
            <em>
              {stage === "assigned"
                ? `${tech} · en route`
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
            {stage === "assigned" ? "Dispatch updated" : "Selected"}
          </p>
          <p className="mkt-product-alert-title">Emergency AC · Oak St</p>
          <p className="mkt-product-alert-meta">
            {stage === "assigning"
              ? "Assigning…"
              : stage === "assigned"
                ? `${tech} · ETA 45 min`
                : "Unassigned · today"}
          </p>
        </div>
        {stage === "assigned" ? (
          <button
            type="button"
            className="mkt-product-chip"
            onClick={reset}
          >
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
            {stage === "assigning" ? "Assigning…" : "Assign tech"}
          </button>
        )}
      </div>
    </div>
  );
}
