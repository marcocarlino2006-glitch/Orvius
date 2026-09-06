"use client";

import { useEffect, useState } from "react";

type Phase = "attention" | "routing" | "assigned";

const techs = ["Jake M.", "Diana R.", "Chris P."] as const;

type HomeProductPreviewProps = {
  /** Ghost depth — legacy hero weather mode */
  atmosphere?: boolean;
  /** Lit product stage — Meta-grade software as the hero image */
  stage?: boolean;
};

/**
 * Product surface for marketing.
 * `stage` = crisp command console (public hero).
 * `atmosphere` = soft depth only.
 * Never shows unfinished assign chrome on marketing surfaces.
 */
export function HomeProductPreview({
  atmosphere = false,
  stage = false,
}: HomeProductPreviewProps) {
  const marketing = atmosphere || stage;
  const [scene, setScene] = useState<Phase>(marketing ? "assigned" : "attention");
  const [tech, setTech] = useState<(typeof techs)[number]>(techs[0]);

  useEffect(() => {
    if (marketing) {
      let cancelled = false;
      const run = () => {
        if (cancelled) return;
        setScene("attention");
        window.setTimeout(() => {
          if (cancelled) return;
          setTech(techs[Math.floor(Math.random() * techs.length)]!);
          setScene("assigned");
        }, stage ? 3200 : 2600);
      };
      run();
      const loop = window.setInterval(run, stage ? 8200 : 7200);
      return () => {
        cancelled = true;
        window.clearInterval(loop);
      };
    }

    if (scene !== "routing") return;
    const timer = window.setTimeout(() => setScene("assigned"), 700);
    return () => window.clearTimeout(timer);
  }, [marketing, scene, stage]);

  function assign() {
    if (marketing || scene !== "attention") return;
    setTech(techs[Math.floor(Math.random() * techs.length)]!);
    setScene("routing");
  }

  function reset() {
    if (marketing) return;
    setScene("attention");
  }

  const statusLine =
    scene === "routing"
      ? "Routing…"
      : scene === "assigned"
        ? `${tech} · ETA 45 min`
        : marketing
          ? "Awaiting dispatch"
          : "Unassigned · today";

  return (
    <div
      className={[
        "mkt-product",
        "mkt-product--company",
        atmosphere ? "mkt-product--atmosphere" : "",
        stage ? "mkt-product--stage" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="mkt-product-top">
        <div>
          <p className="mkt-product-kicker">Tonight · Command</p>
          <p className="mkt-product-title">
            {scene === "assigned" ? "1 on the board" : "3 on the board"}
          </p>
        </div>
        {stage ? (
          <p className="mkt-product-live font-sans">
            <span className="mkt-product-live-dot" aria-hidden />
            Live
          </p>
        ) : null}
      </header>

      <ul className="mkt-product-queue">
        <li
          className={`mkt-product-row ${
            scene === "assigned" ? "mkt-product-row-active" : "mkt-product-row-hot"
          }`}
        >
          <span className="mkt-product-row-tag">
            {scene === "assigned" ? "En route" : "Emergency"}
          </span>
          <span className="mkt-product-row-main">
            AC down · 1842 Oak St
            <em>
              {scene === "assigned"
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
            {scene === "assigned" ? "Dispatch" : "Selected"}
          </p>
          <p className="mkt-product-alert-title">Emergency AC · Oak St</p>
          <p className="mkt-product-alert-meta">{statusLine}</p>
        </div>
        {marketing ? null : scene === "assigned" ? (
          <button type="button" className="mkt-product-chip" onClick={reset}>
            Replay
          </button>
        ) : (
          <button
            type="button"
            className={`mkt-product-chip ${
              scene === "routing" ? "mkt-product-chip-busy" : ""
            }`}
            onClick={assign}
            disabled={scene === "routing"}
            aria-label="Assign technician"
          >
            {scene === "routing" ? "Routing…" : "Assign tech"}
          </button>
        )}
      </div>
    </div>
  );
}
