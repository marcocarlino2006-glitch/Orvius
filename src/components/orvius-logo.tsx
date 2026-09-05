"use client";

import type { CSSProperties } from "react";
import { brandWordmark, logoSizes } from "@/lib/brand-typography";
import { OrviusMarkSvg } from "@/lib/orvius-mark";
import { OrviusWordmarkSvg } from "@/lib/orvius-wordmark";

type OrviusMarkProps = {
  size?: number;
  className?: string;
};

/** Cut O alone — favicons, avatars, compact chrome. */
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
  /** Cut wordmark only (no separate mark). */
  wordmarkOnly?: boolean;
  /** Cut O alone. */
  markOnly?: boolean;
  /**
   * Kept for API compat. Full lockup is always the cut ORVIUS wordmark
   * (mark is no longer glued as a fake O — the cut O lives inside the SVG).
   */
  integrateO?: boolean;
  className?: string;
};

const WORDMARK_HEIGHT = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 44,
} as const;

/**
 * Official lockups:
 * 1) Cut O mark
 * 2) Cut ORVIUS wordmark (letters sliced — Oracle / Tesla energy)
 */
export function OrviusLogo({
  size = "md",
  variant = "chalk",
  wordmarkOnly = false,
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
        "orvius-logo--cut",
        `orvius-logo-${size}`,
        `orvius-logo-${variant}`,
        wordmarkOnly ? "orvius-logo--wordmark" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={brandWordmark}
      style={
        {
          "--logo-mark-size": `${tokens.mark}px`,
          "--logo-wordmark-size": tokens.wordmark,
          "--logo-wordmark-tracking": tokens.tracking,
        } as CSSProperties
      }
    >
      <OrviusWordmarkSvg
        height={WORDMARK_HEIGHT[size]}
        className="orvius-logo-cut-wm"
      />
    </span>
  );
}
