"use client";

import type { CSSProperties } from "react";
import { brandWordmark, logoSizes } from "@/lib/brand-typography";
import { OrviusMarkSvg } from "@/lib/orvius-mark";

type OrviusMarkProps = {
  size?: number;
  className?: string;
};

/** Signal-bridge insignia alone — favicon / avatar chrome only. */
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
  /**
   * Text wordmark only (no mark). Default true — Stripe-style: the name is
   * the brand until a mark earns its place.
   */
  wordmarkOnly?: boolean;
  /** Signal-bridge insignia alone — prefer OrviusMark for favicons. */
  markOnly?: boolean;
  /** Kept for API compat. */
  integrateO?: boolean;
  className?: string;
};

/**
 * Brand lockup = the word. No mark on product or marketing surfaces by default.
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
      aria-label={brandWordmark}
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
      <span className="orvius-logo-word">{brandWordmark}</span>
    </span>
  );
}
