"use client";

import { useState } from "react";
import {
  DEMO_LINE_BUSINESS,
  DEMO_LINE_DISPLAY,
  DEMO_LINE_TEL,
  demoLineHref,
} from "@/lib/demo-line";

type HomeCallDemoProps = {
  /** Always night void — light/hero/compact skins were dead era stacking. */
  showHint?: boolean;
};

export function HomeCallDemo({ showHint = true }: HomeCallDemoProps) {
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
    <div className="call-demo call-demo-void call-demo-section">
      <div className="call-demo-live type-eyebrow" aria-hidden>
        <span className="live-dot live-dot-green" />
        Live now
      </div>

      <a href={demoLineHref()} className="call-demo-number type-phone">
        {DEMO_LINE_DISPLAY}
      </a>

      <div className="call-demo-actions font-sans">
        <a href={demoLineHref()} className="inst-btn inst-btn-primary inst-btn-sm">
          Call the live line
        </a>
        <button type="button" className="call-demo-copy" onClick={copy}>
          {copied ? "Copied" : "Copy number"}
        </button>
      </div>

      {showHint ? (
        <p className="call-demo-hint type-caption">
          {DEMO_LINE_BUSINESS} · Ask for a same-day AC repair · Hear the
          structured intake flow
        </p>
      ) : null}
    </div>
  );
}
