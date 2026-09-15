"use client";

import type { CSSProperties } from "react";
import { brandWordmark, logoSizes } from "@/lib/brand-typography";
import { OrviusMarkSvg } from "@/lib/orvius-mark";

type OrviusMarkProps = {
  size?: number;
  className?: string;
};

/** Open-line mark alone — favicon / avatar. */
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
  /** Text wordmark only (no mark). */
  wordmarkOnly?: boolean;
  /** Open-line mark alone. */
  markOnly?: boolean;
  /** Kept for API compat. */
  integrateO?: boolean;
  className?: string;
};

/**
 * One lockup: open-line aperture + the lowercase Orvius wordmark.
 * The name stays typographic so it remains sharp and accessible at every size.
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
