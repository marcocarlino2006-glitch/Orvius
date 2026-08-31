"use client";

import { useState } from "react";
import {
  DEMO_LINE_BUSINESS,
  DEMO_LINE_DISPLAY,
  DEMO_LINE_TEL,
  demoLineHref,
} from "@/lib/demo-line";

type HomeCallDemoProps = {
  variant?: "void" | "light";
  size?: "hero" | "section" | "compact";
  showHint?: boolean;
};

export function HomeCallDemo({
  variant = "void",
  size = "hero",
  showHint = true,
}: HomeCallDemoProps) {
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

  const rootClass = [
    "call-demo",
    `call-demo-${variant}`,
    `call-demo-${size}`,
  ].join(" ");

  return (
    <div className={rootClass}>
      <div className="call-demo-live font-sans" aria-hidden>
        <span className="live-dot live-dot-green" />
        Live now
      </div>

      <a href={demoLineHref()} className="call-demo-number font-sans">
        {DEMO_LINE_DISPLAY}
      </a>

      <div className="call-demo-actions font-sans">
        <a href={demoLineHref()} className="call-demo-call tier-btn tier-btn-call">
          Call live demo
        </a>
        <button type="button" className="call-demo-copy" onClick={copy}>
          {copied ? "Copied" : "Copy number"}
        </button>
      </div>

      {showHint ? (
        <p className="call-demo-hint font-sans">
          {DEMO_LINE_BUSINESS} · Ask for an emergency AC repair · Owner SMS in
          under 60 seconds
        </p>
      ) : null}
    </div>
  );
}
