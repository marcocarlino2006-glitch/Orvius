"use client";

import type { CSSProperties } from "react";
import { brandWordmark, logoSizes } from "@/lib/brand-typography";
import { OrviusMarkSvg } from "@/lib/orvius-mark";
import { WORDMARK_PATH, WORDMARK_VIEWBOX } from "@/lib/orvius-wordmark";

type OrviusMarkProps = {
  size?: number;
  className?: string;
};

/** The symbol alone — favicon and app icon. */
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
  /** The word alone. The default lockup is the symbol beside ORVIUS. */
  wordmarkOnly?: boolean;
  /** The symbol alone — prefer OrviusMark for favicons. */
  markOnly?: boolean;
  /** Kept for API compat. */
  integrateO?: boolean;
  className?: string;
};

/**
 * Brand lockup: the four-blade symbol beside the ORVIUS wordmark.
 * Both scale with the font-size of .orvius-logo-word.
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
      <span className="orvius-logo-word">
        {wordmarkOnly ? null : <OrviusMarkSvg className="orvius-logo-mark" />}
        <svg className="orvius-logo-svg" viewBox={WORDMARK_VIEWBOX} xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <path d={WORDMARK_PATH} fill="currentColor" fillRule="evenodd" />
        </svg>
      </span>
    </span>
  );
}
