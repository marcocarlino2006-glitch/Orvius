"use client";

import type { CSSProperties } from "react";
import { brandWordmark, logoSizes } from "@/lib/brand-typography";
import { OrviusMarkSvg } from "@/lib/orvius-mark";

type OrviusMarkProps = {
  size?: number;
  className?: string;
};

/** Signal-ring O — favicons, avatars, compact chrome. */
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
  /** Wordmark text only. */
  wordmarkOnly?: boolean;
  /** Signal ring alone. */
  markOnly?: boolean;
  /**
   * When true (default), ring replaces the letter O → [◎]RVIUS.
   */
  integrateO?: boolean;
  className?: string;
};

/**
 * North-star lockups:
 * 1) Signal-ring mark
 * 2) Integrated company name — ring as the O in ORVIUS
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
        markOnly ? "orvius-logo--mark" : "",
        wordmarkOnly ? "orvius-logo--wordmark" : "",
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
        <span className="orvius-logo-wordmark">
          {integrated ? (
            <span className="orvius-logo-rest">RVIUS</span>
          ) : (
            brandWordmark.toUpperCase()
          )}
        </span>
      ) : null}
    </span>
  );
}
