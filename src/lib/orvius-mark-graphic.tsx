import { orviusColors } from "@/lib/orvius-colors";

/** Static sci-fi mark for OG images and favicons. */
export function OrviusMarkGraphic({
  size = 32,
  gradientId = "orvius-mark-og",
  coreId = "orvius-core-og",
}: {
  size?: number;
  gradientId?: string;
  coreId?: string;
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
        <linearGradient id={gradientId} x1="2" y1="0" x2="30" y2="32">
          <stop offset="0%" stopColor={orviusColors.signalHot} />
          <stop offset="45%" stopColor={orviusColors.signal} />
          <stop offset="100%" stopColor={orviusColors.signalDim} />
        </linearGradient>
        <radialGradient id={coreId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFF8F2" />
          <stop offset="35%" stopColor={orviusColors.signalHot} />
          <stop offset="100%" stopColor={orviusColors.signal} />
        </radialGradient>
      </defs>

      <circle
        cx="16"
        cy="16"
        r="14.5"
        stroke={`url(#${gradientId})`}
        strokeWidth="0.45"
        opacity="0.28"
      />
      <circle
        cx="16"
        cy="16"
        r="13"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="58 24"
        opacity="0.95"
      />
      <circle
        cx="16"
        cy="16"
        r="9.5"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeDasharray="38 18"
        opacity="0.78"
        transform="rotate(72 16 16)"
      />
      <circle
        cx="16"
        cy="16"
        r="6"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeDasharray="24 14"
        opacity="0.55"
        transform="rotate(144 16 16)"
      />
      <path d="M5.5 11V7.5H9" stroke={`url(#${gradientId})`} strokeWidth="0.9" opacity="0.45" />
      <path d="M26.5 11V7.5H23" stroke={`url(#${gradientId})`} strokeWidth="0.9" opacity="0.45" />
      <path d="M5.5 21V24.5H9" stroke={`url(#${gradientId})`} strokeWidth="0.9" opacity="0.45" />
      <path d="M26.5 21V24.5H23" stroke={`url(#${gradientId})`} strokeWidth="0.9" opacity="0.45" />
      <path
        d="M16 0.4V4.8"
        stroke={`url(#${gradientId})`}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="4.2" fill={`url(#${gradientId})`} opacity="0.12" />
      <circle cx="16" cy="16" r="2.35" fill={`url(#${coreId})`} />
      <circle cx="16" cy="16" r="0.85" fill="#FFF8F2" opacity="0.95" />
    </svg>
  );
}
