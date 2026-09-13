"use client";

import { useState } from "react";
import { HomeProductPreview } from "@/components/home-product-preview";
import { DEMO_LINE_DISPLAY, DEMO_LINE_TEL } from "@/lib/demo-line";

/**
 * Institutional product showcase: command-board presence on cool paper.
 * Copy left, dense night OS preview right — no macOS chrome, no soft cards.
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
          <p className="mkt-showcase-eyebrow font-sans" data-i18n="showcase.eyebrow">
            Command board
          </p>
          <h2
            id="home-showcase-heading"
            className="mkt-showcase-title"
            data-i18n="showcase.title"
          >
            The night board your shop runs on.
          </h2>
          <p className="mkt-showcase-lead font-sans" data-i18n="showcase.lead">
            Answer, qualify, book, alert — one graphite board. Copper marks
            what still needs the owner. No scavenger hunt across tools.
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
