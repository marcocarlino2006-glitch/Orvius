"use client";

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
  showOs?: boolean;
  markOnly?: boolean;
  className?: string;
};

const markSizes = { sm: 22, md: 26, lg: 30, xl: 34 } as const;

export function OrviusLogo({
  size = "md",
  variant = "chalk",
  showOs = false,
  markOnly = false,
  className = "",
}: OrviusLogoProps) {
  return (
    <span
      className={`orvius-logo orvius-logo-${size} orvius-logo-${variant} ${className}`}
    >
      <OrviusMarkSvg size={markSizes[size]} className="orvius-logo-mark" />
      {!markOnly ? (
        <span className="orvius-logo-text">
          <span className="orvius-logo-wordmark font-brand">Orvius</span>
          {showOs ? <span className="orvius-logo-tag font-brand">OS</span> : null}
        </span>
      ) : null}
    </span>
  );
}
