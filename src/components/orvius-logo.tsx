"use client";

import type { CSSProperties } from "react";
import { brandWordmark, logoSizes } from "@/lib/brand-typography";
import { OrviusMarkSvg } from "@/lib/orvius-mark";
import { WORDMARK_PATH, WORDMARK_VIEWBOX } from "@/lib/orvius-wordmark";

type OrviusMarkProps = {
  size?: number;
  className?: string;
};

/** The O alone — favicon / avatar chrome only. */
export function OrviusMark({ size = 24, className = "" }: OrviusMarkProps) {
  return (
    <OrviusMarkSvg
      size={size}
      className={`orvius-mark ${className}`.trim()}
    />
  );
}

type OrviusLogoProps = {
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "void" | "chalk";
  /** The wordmark alone (no separate mark beside it). Default true: the name is the brand. */
  wordmarkOnly?: boolean;
  /** The O alone — prefer OrviusMark for favicons. */
  markOnly?: boolean;
  /** Kept for API compat. */
  integrateO?: boolean;
  className?: string;
};

/**
 * Brand lockup = the wordmark artwork. It scales with the font-size of
 * .orvius-logo-word, so every surface that sized the old text logo still sizes this one.
 */
export function OrviusLogo({
  size = "md",
  variant = "chalk",
  wordmarkOnly = true,
  markOnly = false,
  className = "",
}: OrviusLogoProps) {
  const tokens = logoSizes[size];

  if (markOnly) {
    return (
      <span
        className={[
          "orvius-logo",
          "orvius-logo--mark",
          `orvius-logo-${size}`,
          `orvius-logo-${variant}`,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label={brandWordmark}
      >
        <OrviusMarkSvg size={tokens.mark} className="orvius-logo-mark" />
      </span>
    );
  }

  return (
    <span
      className={[
        "orvius-logo",
        "orvius-logo--wordmark",
        wordmarkOnly ? "orvius-logo--text" : "",
        `orvius-logo-${size}`,
        `orvius-logo-${variant}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="img"
      aria-label="Orvius"
      style={
        {
          "--logo-mark-size": `${tokens.mark}px`,
          "--logo-word-size": tokens.word,
          "--logo-word-tracking": tokens.tracking,
        } as CSSProperties
      }
    >
      {wordmarkOnly ? null : (
        <OrviusMarkSvg size={tokens.mark} className="orvius-logo-mark" />
      )}
      <span className="orvius-logo-word">
        <svg className="orvius-logo-svg" viewBox={WORDMARK_VIEWBOX} xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <path d={WORDMARK_PATH} fill="currentColor" />
        </svg>
      </span>
    </span>
  );
}
