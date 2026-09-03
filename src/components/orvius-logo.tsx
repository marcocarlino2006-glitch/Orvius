"use client";

import type { CSSProperties } from "react";
import { brandWordmark, logoSizes } from "@/lib/brand-typography";
import { OrviusMarkSvg } from "@/lib/orvius-mark";

type OrviusMarkProps = {
  size?: number;
  className?: string;
};

/** Standalone circle mark — favicons, avatars, compact chrome. */
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
   * Circle + wordmark is the locked brand lockup (default).
   * Pass true only for rare text-only contexts.
   */
  wordmarkOnly?: boolean;
  /** Circle alone — no wordmark. */
  markOnly?: boolean;
  className?: string;
};

/**
 * Official lockup: Oracle/Grok-style circle always beside ORVIUS.
 * The circle stays. Do not strip it in product or marketing chrome.
 */
export function OrviusLogo({
  size = "md",
  variant = "chalk",
  wordmarkOnly = false,
  markOnly = false,
  className = "",
}: OrviusLogoProps) {
  const tokens = logoSizes[size];
  const showMark = markOnly || !wordmarkOnly;
  const showWordmark = !markOnly;

  return (
    <span
      className={`orvius-logo orvius-logo-${size} orvius-logo-${variant} ${className}`}
      aria-label={brandWordmark}
      style={
        {
          "--logo-mark-size": `${tokens.mark}px`,
          ...(showWordmark
            ? {
                "--logo-wordmark-size": tokens.wordmark,
                "--logo-wordmark-tracking": tokens.tracking,
              }
            : {}),
        } as CSSProperties
      }
    >
      {showMark ? (
        <span className="orvius-logo-mark-wrap" aria-hidden>
          <OrviusMarkSvg size={tokens.mark} className="orvius-logo-mark" />
        </span>
      ) : null}
      {showWordmark ? (
        <span className="orvius-logo-wordmark type-wordmark">{brandWordmark}</span>
      ) : null}
    </span>
  );
}
