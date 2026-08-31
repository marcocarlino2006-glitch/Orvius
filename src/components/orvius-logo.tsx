"use client";

import { useId } from "react";

type OrviusMarkProps = {
  size?: number;
  className?: string;
};

/** Four-ring signal mark — static, no motion. */
export function OrviusMark({ size = 24, className = "" }: OrviusMarkProps) {
  const uid = useId().replace(/:/g, "");
  const gradId = `orvius-grad-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`orvius-mark ${className}`.trim()}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="8" y1="4" x2="24" y2="28">
          <stop offset="0%" stopColor="#F58868" />
          <stop offset="100%" stopColor="#E05A32" />
        </linearGradient>
      </defs>

      <rect x="1" y="1" width="30" height="30" rx="8" fill="#3F3F3C" />

      <circle
        cx="16"
        cy="16"
        r="11.5"
        stroke={`url(#${gradId})`}
        strokeWidth="1.15"
        fill="none"
        opacity="0.32"
      />
      <circle
        cx="16"
        cy="16"
        r="8.5"
        stroke={`url(#${gradId})`}
        strokeWidth="1.25"
        fill="none"
        opacity="0.52"
      />
      <circle
        cx="16"
        cy="16"
        r="5.5"
        stroke={`url(#${gradId})`}
        strokeWidth="1.35"
        fill="none"
        opacity="0.78"
      />
      <circle cx="16" cy="16" r="2.75" fill={`url(#${gradId})`} />
    </svg>
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
      className={`orvius-logo orvius-logo-${size} orvius-logo-${variant} ${className}`}
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
