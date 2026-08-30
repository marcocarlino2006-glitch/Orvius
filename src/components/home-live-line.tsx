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
    <div className={`home-command ${variant === "void" ? "home-command-void" : ""}`}>
      <code className="home-command-code font-sans">{LINE}</code>
      <button type="button" className="home-command-copy font-sans" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
