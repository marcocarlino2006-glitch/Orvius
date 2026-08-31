"use client";

import { useId } from "react";
import { OrviusMarkSvg } from "@/lib/orvius-mark";

type OrviusMarkProps = {
  size?: number;
  className?: string;
};

/** Hex signal mark — Tesla-inspired sci-fi, static. */
export function OrviusMark({ size = 24, className = "" }: OrviusMarkProps) {
  const uid = useId().replace(/:/g, "");
  const gradId = `orvius-mark-${uid}`;

  return (
    <OrviusMarkSvg
      gradientId={gradId}
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

const markSizes = { sm: 26, md: 32, lg: 36, xl: 44 } as const;

export function OrviusLogo({
  size = "md",
  variant = "chalk",
  showOs = false,
  markOnly = false,
  className = "",
}: OrviusLogoProps) {
  return (
    <span
      className={`orvius-logo orvius-logo-${size} orvius-logo-${variant} orvius-logo-scifi ${className}`}
    >
      <OrviusMark size={markSizes[size]} className="orvius-logo-mark" />
      {!markOnly ? (
        <span className="orvius-logo-text">
          <span className="orvius-logo-wordmark font-sans">Orvius</span>
          {showOs ? <span className="orvius-logo-os font-sans">OS</span> : null}
        </span>
      ) : null}
    </span>
  );
}
