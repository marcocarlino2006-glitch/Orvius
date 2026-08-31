import { orviusColors } from "@/lib/orvius-colors";

/** Shared mark graphic for OG images and favicons (no React hooks). */
export function OrviusMarkGraphic({
  size = 32,
  gradientId = "orvius-mark-og",
}: {
  size?: number;
  gradientId?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradientId} x1="4" y1="2" x2="28" y2="30">
          <stop offset="0%" stopColor={orviusColors.signalHot} />
          <stop offset="52%" stopColor={orviusColors.signal} />
          <stop offset="100%" stopColor={orviusColors.signalDim} />
        </linearGradient>
      </defs>
      <circle
        cx="16"
        cy="16"
        r="13.5"
        stroke={`url(#${gradientId})`}
        strokeWidth="2.35"
        strokeLinecap="round"
        strokeDasharray="72 14"
        transform="rotate(-90 16 16)"
      />
      <circle
        cx="16"
        cy="16"
        r="10"
        stroke={`url(#${gradientId})`}
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
        stroke={`url(#${gradientId})`}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeDasharray="34 10"
        opacity="0.58"
        transform="rotate(-90 16 16)"
      />
      <circle cx="16" cy="16" r="1.65" fill={`url(#${gradientId})`} />
      <path
        d="M16 1.1V3.6"
        stroke={`url(#${gradientId})`}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
