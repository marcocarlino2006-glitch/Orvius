"use client";

import { useId } from "react";

type OrviusMarkProps = {
  size?: number;
  className?: string;
  animated?: boolean;
};

/** Sci-fi orbital signal mark — HUD rings, targeting frame, live core. */
export function OrviusMark({
  size = 24,
  className = "",
  animated = true,
}: OrviusMarkProps) {
  const uid = useId().replace(/:/g, "");
  const gradId = `orvius-grad-${uid}`;
  const glowId = `orvius-glow-${uid}`;
  const coreId = `orvius-core-${uid}`;

  const motionClass = animated ? "orvius-mark-animated" : "";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`orvius-mark ${motionClass} ${className}`.trim()}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="2" y1="0" x2="30" y2="32">
          <stop offset="0%" stopColor="#F8A88A" />
          <stop offset="45%" stopColor="#F58868" />
          <stop offset="100%" stopColor="#E05A32" />
        </linearGradient>
        <radialGradient id={coreId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFF5F0" />
          <stop offset="35%" stopColor="#F58868" />
          <stop offset="100%" stopColor="#F0704A" />
        </radialGradient>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.1" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle
        cx="16"
        cy="16"
        r="14.5"
        stroke={`url(#${gradId})`}
        strokeWidth="0.45"
        opacity="0.28"
      />

      <g className="orvius-orbit orvius-orbit-a">
        <circle
          cx="16"
          cy="16"
          r="13"
          stroke={`url(#${gradId})`}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeDasharray="58 24"
          opacity="0.95"
        />
      </g>

      <g className="orvius-orbit orvius-orbit-b">
        <circle
          cx="16"
          cy="16"
          r="9.5"
          stroke={`url(#${gradId})`}
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeDasharray="38 18"
          opacity="0.78"
        />
      </g>

      <g className="orvius-orbit orvius-orbit-c">
        <circle
          cx="16"
          cy="16"
          r="6"
          stroke={`url(#${gradId})`}
          strokeWidth="1.1"
          strokeLinecap="round"
          strokeDasharray="24 14"
          opacity="0.55"
        />
      </g>

      <g stroke={`url(#${gradId})`} strokeLinecap="round" opacity="0.45">
        <path d="M5.5 11V7.5H9" strokeWidth="0.9" />
        <path d="M26.5 11V7.5H23" strokeWidth="0.9" />
        <path d="M5.5 21V24.5H9" strokeWidth="0.9" />
        <path d="M26.5 21V24.5H23" strokeWidth="0.9" />
      </g>

      <g stroke={`url(#${gradId})`} strokeWidth="0.55" opacity="0.35">
        <line x1="16" y1="1.5" x2="16" y2="3.2" />
        <line x1="22.8" y1="3.8" x2="21.6" y2="5" />
        <line x1="28.5" y1="16" x2="26.8" y2="16" />
        <line x1="9.2" y1="3.8" x2="10.4" y2="5" />
        <line x1="3.5" y1="16" x2="5.2" y2="16" />
      </g>

      <g className="orvius-mark-beam" filter={`url(#${glowId})`}>
        <path
          d="M16 0.4V4.8"
          stroke={`url(#${gradId})`}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d="M16 0.4L19.2 3.8"
          stroke={`url(#${gradId})`}
          strokeWidth="1.1"
          strokeLinecap="round"
          opacity="0.7"
        />
        <path
          d="M16 0.4L12.8 3.8"
          stroke={`url(#${gradId})`}
          strokeWidth="1.1"
          strokeLinecap="round"
          opacity="0.7"
        />
      </g>

      <circle
        className="orvius-mark-halo"
        cx="16"
        cy="16"
        r="4.2"
        fill={`url(#${gradId})`}
        opacity="0.12"
      />
      <circle
        className="orvius-mark-core"
        cx="16"
        cy="16"
        r="2.35"
        fill={`url(#${coreId})`}
        filter={`url(#${glowId})`}
      />
      <circle cx="16" cy="16" r="0.85" fill="#FFF8F2" opacity="0.95" />
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

const markSizes = { sm: 28, md: 40, lg: 54, xl: 72 } as const;

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
      <OrviusMark size={markSizes[size]} className="orvius-logo-mark" animated />
      {!markOnly ? (
        <span className="orvius-logo-text">
          <span className="orvius-logo-wordmark">Orvius</span>
          {showOs ? <span className="orvius-logo-os font-sans">OS</span> : null}
        </span>
      ) : null}
    </span>
  );
}
