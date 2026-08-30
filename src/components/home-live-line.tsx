"use client";

import { useState } from "react";

const LINE = "+1 844 643 9170";

type HomeLiveLineProps = {
  variant?: "light" | "void";
};

export function HomeLiveLine({ variant = "light" }: HomeLiveLineProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(LINE.replace(/\s/g, ""));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className={`tier-live ${variant === "void" ? "tier-live-void" : "tier-live-light"}`}
    >
      <code className="tier-live-number font-sans">{LINE}</code>
      <button type="button" className="tier-live-copy font-sans" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
