"use client";

import { brandWordmark } from "@/lib/brand-typography";
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
  /** Wordmark only — header/footer default */
  wordmarkOnly?: boolean;
  markOnly?: boolean;
  className?: string;
};

const markSizes = { sm: 20, md: 24, lg: 28, xl: 32 } as const;

export function OrviusLogo({
  size = "md",
  variant = "chalk",
  wordmarkOnly = false,
  markOnly = false,
  className = "",
}: OrviusLogoProps) {
  const showMark = !wordmarkOnly;
  const showWordmark = !markOnly;

  return (
    <span
      className={`orvius-logo orvius-logo-${size} orvius-logo-${variant} ${className}`}
      aria-label={brandWordmark}
    >
      {showMark ? (
        <OrviusMarkSvg size={markSizes[size]} className="orvius-logo-mark" />
      ) : null}
      {showWordmark ? (
        <span className="orvius-logo-wordmark type-wordmark">{brandWordmark}</span>
      ) : null}
    </span>
  );
}
