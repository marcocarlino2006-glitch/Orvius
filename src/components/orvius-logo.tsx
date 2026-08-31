"use client";

import { useId } from "react";

type OrviusMarkProps = {
  size?: number;
  className?: string;
};

/** Four-ring signal mark — OS depth with outbound alert at 12 o'clock. */
export function OrviusMark({ size = 24, className = "" }: OrviusMarkProps) {
  const uid = useId().replace(/:/g, "");
  const gradId = `orvius-mark-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="4" y1="2" x2="28" y2="30">
          <stop offset="0%" stopColor="#E8956D" />
          <stop offset="52%" stopColor="#D97757" />
          <stop offset="100%" stopColor="#C2613F" />
        </linearGradient>
      </defs>

      <circle
        cx="16"
        cy="16"
        r="13.5"
        stroke={`url(#${gradId})`}
        strokeWidth="2.35"
        strokeLinecap="round"
        strokeDasharray="72 14"
        transform="rotate(-90 16 16)"
      />
      <circle
        cx="16"
        cy="16"
        r="10"
        stroke={`url(#${gradId})`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="53 12"
        opacity="0.82"
        transform="rotate(-90 16 16)"
      />
      <circle
        cx="16"
        cy="16"
        r="6.5"
        stroke={`url(#${gradId})`}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeDasharray="34 10"
        opacity="0.58"
        transform="rotate(-90 16 16)"
      />
      <circle
        cx="16"
        cy="16"
        r="3.2"
        stroke={`url(#${gradId})`}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeDasharray="17 7"
        opacity="0.38"
        transform="rotate(-90 16 16)"
      />

      <circle cx="16" cy="16" r="1.65" fill={`url(#${gradId})`} />

      <path
        d="M16 1.1V3.6"
        stroke={`url(#${gradId})`}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M16 1.1L17.8 2.7"
        stroke={`url(#${gradId})`}
        strokeWidth="1.15"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M16 1.1L14.2 2.7"
        stroke={`url(#${gradId})`}
        strokeWidth="1.15"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

type OrviusLogoProps = {
  size?: "sm" | "md" | "lg";
  variant?: "void" | "chalk";
  showOs?: boolean;
  markOnly?: boolean;
  className?: string;
};

const markSizes = { sm: 20, md: 24, lg: 30 } as const;

export function OrviusLogo({
  size = "md",
  variant = "void",
  showOs = true,
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
          <span className="orvius-logo-wordmark">Orvius</span>
          {showOs ? <span className="orvius-logo-os font-sans">OS</span> : null}
        </span>
      ) : null}
    </span>
  );
}
