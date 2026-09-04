"use client";

import type { CSSProperties } from "react";
import { brandWordmark, logoSizes } from "@/lib/brand-typography";
import { OrviusMarkSvg } from "@/lib/orvius-mark";

type OrviusMarkProps = {
  size?: number;
  className?: string;
};

/** Standalone dual-rail O — favicons, avatars, compact chrome (line 1). */
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
   * Wordmark only without the substituted O mark.
   * Prefer default integrated lockup.
   */
  wordmarkOnly?: boolean;
  /** Dual-rail O alone — no RVIUS letters. */
  markOnly?: boolean;
  /**
   * When true (default), mark replaces the letter O → [O]RVIUS.
   * When false with show mark, mark sits beside full ORVIUS (legacy).
   */
  integrateO?: boolean;
  className?: string;
};

/**
 * Official lockups (X.com pattern — two lines):
 * 1) Mark alone — dual-rail O
 * 2) Integrated wordmark — mark substitutes the O in ORVIUS
 */
export function OrviusLogo({
  size = "md",
  variant = "chalk",
  wordmarkOnly = false,
  markOnly = false,
  integrateO = true,
  className = "",
}: OrviusLogoProps) {
  const tokens = logoSizes[size];
  const showMark = markOnly || !wordmarkOnly;
  const showWordmark = !markOnly;
  const integrated = showMark && showWordmark && integrateO && !wordmarkOnly;

  return (
    <span
      className={[
        "orvius-logo",
        `orvius-logo-${size}`,
        `orvius-logo-${variant}`,
        integrated ? "orvius-logo--integrated" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
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
        <span className="orvius-logo-wordmark type-wordmark">
          {integrated ? (
            <span className="orvius-logo-rest">RVIUS</span>
          ) : (
            brandWordmark
          )}
        </span>
      ) : null}
    </span>
  );
}
