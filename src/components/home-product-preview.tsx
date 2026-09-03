"use client";

import { useEffect, useState } from "react";

type Stage = "attention" | "assigning" | "assigned";

const techs = ["Jake M.", "Diana R.", "Chris P."] as const;

/** Interactive command-center preview — living OS, not a static card. */
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

  const unassigned = stage === "assigned" ? 1 : 2;
  const attention = stage === "assigned" ? 2 : 3;
  const pipeline = stage === "assigned" ? "$4.2k" : "$3.8k";

  return (
    <div className="mkt-product mkt-product-rich mkt-product-live-os mkt-product--mastery">
      <div className="mkt-product-chrome">
        <div className="mkt-product-dots" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <span className="mkt-product-url">orvius.im/command</span>
        <span className="mkt-product-live">
          <span className="mkt-live-dot" />
          Sample day
        </span>
      </div>

      <div className="mkt-product-shell">
        <aside className="mkt-product-rail" aria-hidden>
          <p className="mkt-product-rail-brand">
            <span className="mkt-product-rail-o" aria-hidden />
            Orvius
          </p>
          <nav className="mkt-product-rail-nav">
            <span className="mkt-product-rail-active">Command</span>
            <span>Inbox</span>
            <span>Jobs</span>
            <span>Dispatch</span>
            <span>Ask</span>
            <span>Money</span>
          </nav>
          <div className="mkt-product-rail-foot">
            <span className="mkt-product-rail-meta">Summit HVAC</span>
            <span className="mkt-product-rail-meta">Pro · reference shop</span>
          </div>
        </aside>

        <div className="mkt-product-main">
          <header className="mkt-product-top">
            <div>
              <p className="mkt-product-kicker">Today · attention queue</p>
              <p className="mkt-product-title">{attention} need you</p>
            </div>
            <div className="mkt-product-metrics" aria-label="Representative sample metrics">
              <div>
                <span>Calls</span>
                <strong>14</strong>
              </div>
              <div>
                <span>Booked</span>
                <strong>9</strong>
              </div>
              <div>
                <span>Unassigned</span>
                <strong>{unassigned}</strong>
              </div>
              <div>
                <span>Pipeline</span>
                <strong>{pipeline}</strong>
              </div>
            </div>
          </header>

          <p className="mkt-product-sample font-sans">
            Representative shop day — not a live customer metric.
          </p>

          <ul className="mkt-product-queue">
            <li
              className={`mkt-product-row mkt-product-row-hot ${
                stage === "attention" ? "mkt-product-row-selected" : ""
              } ${stage === "assigned" ? "mkt-product-row-done" : ""}`}
            >
              <span className="mkt-product-row-tag">
                {stage === "assigned" ? "Assigned" : "Emergency"}
              </span>
              <span className="mkt-product-row-main">
                AC down · 1842 Oak St
                <em>
                  {stage === "assigned"
                    ? `${tech} · en route · SMS confirmed`
                    : "Maria Lopez · booked today · SMS sent"}
                </em>
              </span>
              <span className="mkt-product-row-action">
                {stage === "assigned" ? "Board" : "Assign"}
              </span>
            </li>
            <li className="mkt-product-row">
              <span className="mkt-product-row-tag">After hours</span>
              <span className="mkt-product-row-main">
                No hot water · 411 Pine
                <em>Callback captured · awaiting review</em>
              </span>
              <span className="mkt-product-row-action">Review</span>
            </li>
            <li className="mkt-product-row">
              <span className="mkt-product-row-tag">Money</span>
              <span className="mkt-product-row-main">
                Estimate ready · $480
                <em>Draft on job · await owner send</em>
              </span>
              <span className="mkt-product-row-action">Invoice</span>
            </li>
          </ul>

          <div className="mkt-product-detail">
            <div className="mkt-product-detail-col">
              <p className="mkt-product-alert-kicker">
                {stage === "assigned" ? "Dispatch updated" : "Selected job"}
              </p>
              <p className="mkt-product-alert-title">Emergency AC · Oak St</p>
              <p className="mkt-product-alert-meta">
                {stage === "assigning"
                  ? "Assigning technician…"
                  : stage === "assigned"
                    ? `Tech: ${tech} · ETA: 45 min · owner alert resent`
                    : "Tech: unassigned · ETA: today · est. $480"}
              </p>
            </div>
            <div className="mkt-product-detail-actions">
              {stage === "assigned" ? (
                <button type="button" className="mkt-product-chip mkt-product-chip-muted" onClick={reset}>
                  Replay
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={`mkt-product-chip ${stage === "assigning" ? "mkt-product-chip-busy" : ""}`}
                    onClick={assign}
                    disabled={stage === "assigning"}
                    aria-label="Assign technician to emergency AC job"
                  >
                    {stage === "assigning" ? "Assigning…" : "Assign tech"}
                  </button>
                  <span className="mkt-product-chip mkt-product-chip-muted">Open inbox</span>
                </>
              )}
            </div>
          </div>

          {stage === "assigned" ? (
            <p className="mkt-product-toast font-sans" role="status">
              Owner alert resent · job moved to dispatch · estimate still on record
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
