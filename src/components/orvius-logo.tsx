"use client";

import type { CSSProperties } from "react";
import { brandWordmark, logoSizes } from "@/lib/brand-typography";
import { OrviusMarkSvg } from "@/lib/orvius-mark";
import { OrviusWordmarkSvg } from "@/lib/orvius-wordmark";

type OrviusMarkProps = {
  size?: number;
  className?: string;
};

/** Signal O alone — favicon / avatar. Same letter as in the wordmark. */
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
  /** Full custom ORVIUS wordmark (default path). */
  wordmarkOnly?: boolean;
  /** Signal O alone. */
  markOnly?: boolean;
  /** Kept for API compat — wordmark already includes the O. */
  integrateO?: boolean;
  className?: string;
};

const WORDMARK_HEIGHT = {
  sm: 18,
  md: 22,
  lg: 26,
  xl: 52,
} as const;

/**
 * Best-path lockups:
 * 1) Full custom ORVIUS wordmark (name = logo)
 * 2) Signal O alone (favicon)
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
        "orvius-logo--wordmark",
        `orvius-logo-${size}`,
        `orvius-logo-${variant}`,
        wordmarkOnly ? "orvius-logo--text" : "",
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
        className="orvius-logo-wm"
      />
    </span>
  );
}
