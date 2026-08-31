"use client";

import { useId } from "react";
import { OrviusMarkSvg } from "@/lib/orvius-mark";

type OrviusMarkProps = {
  size?: number;
  className?: string;
};

export function OrviusMark({ size = 24, className = "" }: OrviusMarkProps) {
  const uid = useId().replace(/:/g, "");
  const gradId = `orvius-mark-${uid}`;

  return (
    <OrviusMarkSvg
      gradientId={gradId}
      size={size}
      className={`orvius-mark orvius-mark-reticle ${className}`.trim()}
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

const markSizes = { sm: 28, md: 34, lg: 38, xl: 46 } as const;

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
