"use client";

import { useEffect, useState } from "react";

type Phase = "incoming" | "working" | "cleared";

/**
 * Cursor-grade product preview for marketing.
 * Dense board + activity stream. Real tool density, not a soft card collage.
 */
export function HomeProductPreview({
  atmosphere = false,
  stage = false,
}: {
  atmosphere?: boolean;
  stage?: boolean;
}) {
  const marketing = atmosphere || stage;
  const [phase, setPhase] = useState<Phase>(marketing ? "working" : "incoming");

  useEffect(() => {
    if (!marketing) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      setPhase("incoming");
      window.setTimeout(() => {
        if (!cancelled) setPhase("working");
      }, 2200);
      window.setTimeout(() => {
        if (!cancelled) setPhase("cleared");
      }, 5200);
    };
    tick();
    const loop = window.setInterval(tick, 9000);
    return () => {
      cancelled = true;
      window.clearInterval(loop);
    };
  }, [marketing]);

  const criticalCount = phase === "cleared" ? 1 : 2;
  const followCount = phase === "incoming" ? 3 : 2;

  return (
    <div
      className={[
        "mkt-product",
        "mkt-product--company",
        "mkt-product--dense",
        atmosphere ? "mkt-product--atmosphere" : "",
        stage ? "mkt-product--stage" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="mkt-product-chrome font-sans">
        <div className="mkt-product-chrome-left">
          <span className="mkt-product-chrome-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="mkt-product-chrome-path">orvius.im/command</span>
        </div>
        <p className="mkt-product-live">
          <span className="mkt-product-live-dot" aria-hidden />
          Live
        </p>
      </header>

      <div className="mkt-product-body">
        <aside className="mkt-product-rail font-sans" aria-hidden>
          <p className="mkt-product-rail-label">Critical · {criticalCount}</p>
          <ul className="mkt-product-rail-list">
            <li className={phase === "cleared" ? "is-done" : "is-hot"}>
              <span className="mkt-product-rail-mark" aria-hidden />
              <div>
                <strong>AC down · Oak St</strong>
                <em>
                  {phase === "cleared"
                    ? "Jake M. · en route"
                    : phase === "working"
                      ? "Booking confirm…"
                      : "Emergency · now"}
                </em>
              </div>
              <time>{phase === "cleared" ? "12m" : "now"}</time>
            </li>
            {phase !== "cleared" ? (
              <li className="is-hot">
                <span className="mkt-product-rail-mark" aria-hidden />
                <div>
                  <strong>No heat · Pine</strong>
                  <em>After hours · captured</em>
                </div>
                <time>4m</time>
              </li>
            ) : null}
          </ul>

          <p className="mkt-product-rail-label">Needs you · {followCount}</p>
          <ul className="mkt-product-rail-list">
            <li className="is-ready">
              <span className="mkt-product-rail-check" aria-hidden />
              <div>
                <strong>Estimate · $480</strong>
                <em>Ready to send</em>
              </div>
              <time>18m</time>
            </li>
            <li className="is-ready">
              <span className="mkt-product-rail-check" aria-hidden />
              <div>
                <strong>Callback · Lopez</strong>
                <em>Booked for morning</em>
              </div>
              <time>41m</time>
            </li>
          </ul>
        </aside>

        <div className="mkt-product-stream font-sans">
          <p className="mkt-product-stream-kicker">Tonight · Command</p>
          <h3 className="mkt-product-stream-title">
            {phase === "incoming"
              ? "Incoming after-hours call"
              : phase === "working"
                ? "Qualifying · booking · alerting"
                : "Board updated · owner notified"}
          </h3>

          <ol className="mkt-product-steps">
            <li className="is-done">
              <span>Answered</span>
              <em>0.8s</em>
            </li>
            <li className={phase === "incoming" ? "is-active" : "is-done"}>
              <span>Read service · urgency · address</span>
              <em>{phase === "incoming" ? "…" : "2s"}</em>
            </li>
            <li
              className={
                phase === "working" ? "is-active" : phase === "cleared" ? "is-done" : ""
              }
            >
              <span>Book job · alert owner SMS</span>
              <em>{phase === "cleared" ? "1s" : phase === "working" ? "…" : ""}</em>
            </li>
            <li className={phase === "cleared" ? "is-done" : ""}>
              <span>On the board before morning</span>
              <em>{phase === "cleared" ? "done" : ""}</em>
            </li>
          </ol>

          <div className="mkt-product-reply">
            <p>
              {phase === "cleared"
                ? "Emergency AC · Oak St is booked. Jake M. rolling — ETA 45 min. Owner SMS delivered."
                : phase === "working"
                  ? "Confirming callback number, marking emergency, writing the job to Summit HVAC."
                  : "Inbound after hours. Capturing name, phone, service, urgency, address."}
            </p>
          </div>
        </div>
      </div>

      <div className="mkt-product-cli font-sans" aria-hidden>
        <span className="mkt-product-cli-label">Live line</span>
        <span className="mkt-product-cli-text">
          +1 844 643 9170 · ask emergency AC · owner alert under 60s
        </span>
      </div>
    </div>
  );
}
