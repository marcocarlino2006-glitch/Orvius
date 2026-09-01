"use client";

import type { CSSProperties } from "react";
import { brandWordmark, logoSizes } from "@/lib/brand-typography";
import { OrviusMarkSvg } from "@/lib/orvius-mark";

type OrviusMarkProps = {
  size?: number;
  className?: string;
};

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
  /** Wordmark only — tight spaces (mobile drawer) */
  wordmarkOnly?: boolean;
  markOnly?: boolean;
  className?: string;
};

export function OrviusLogo({
  size = "md",
  variant = "chalk",
  wordmarkOnly = false,
  markOnly = false,
  className = "",
}: OrviusLogoProps) {
  const tokens = logoSizes[size];
  const showMark = !wordmarkOnly;
  const showWordmark = !markOnly;

  return (
    <span
      className={`orvius-logo orvius-logo-${size} orvius-logo-${variant} ${className}`}
      aria-label={brandWordmark}
      style={
        showWordmark
          ? ({
              "--logo-wordmark-size": tokens.wordmark,
              "--logo-wordmark-tracking": tokens.tracking,
            } as CSSProperties)
          : undefined
      }
    >
      {showMark ? (
        <OrviusMarkSvg size={tokens.mark} className="orvius-logo-mark" />
      ) : null}
      {showWordmark ? (
        <span className="orvius-logo-wordmark type-wordmark">{brandWordmark}</span>
      ) : null}
    </span>
  );
}
