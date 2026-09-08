"use client";

import { useState } from "react";
import { HomeProductPreview } from "@/components/home-product-preview";
import { DEMO_LINE_DISPLAY, DEMO_LINE_TEL } from "@/lib/demo-line";

/**
 * Cursor-style product showcase: feature copy + copy-snippet on the left,
 * a framed product mockup on the right. Dark app on a light section.
 */
export function HomeToolShowcase() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(DEMO_LINE_TEL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="mkt-showcase" aria-labelledby="home-showcase-heading">
      <div className="editorial-wrap mkt-showcase-grid">
        <div className="mkt-showcase-copy">
          <p className="mkt-showcase-eyebrow font-sans">On the line</p>
          <h2 id="home-showcase-heading" className="mkt-showcase-title">
            In every call, at every step.
          </h2>
          <p className="mkt-showcase-lead font-sans">
            Orvius answers the line, qualifies the job, alerts the owner, and
            works the dispatch board — one record, start to finish.
          </p>

          <div className="mkt-showcase-snippet">
            <code>dial {DEMO_LINE_DISPLAY}</code>
            <button
              type="button"
              onClick={copy}
              className="mkt-showcase-copybtn"
              aria-label="Copy the live line number"
            >
              {copied ? (
                <span className="mkt-showcase-copied">Copied</span>
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="mkt-showcase-stage">
          <HomeProductPreview stage />
        </div>
      </div>
    </section>
  );
}
