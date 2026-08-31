import { orviusColors } from "@/lib/orvius-colors";

/** Static four-ring mark for OG images and favicons. */
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
        <linearGradient id={gradientId} x1="8" y1="4" x2="24" y2="28">
          <stop offset="0%" stopColor={orviusColors.signalHot} />
          <stop offset="100%" stopColor={orviusColors.signalDim} />
        </linearGradient>
      </defs>

      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="8"
        fill={orviusColors.panel}
      />
      <circle
        cx="16"
        cy="16"
        r="11.5"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.15"
        fill="none"
        opacity="0.32"
      />
      <circle
        cx="16"
        cy="16"
        r="8.5"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.25"
        fill="none"
        opacity="0.52"
      />
      <circle
        cx="16"
        cy="16"
        r="5.5"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.35"
        fill="none"
        opacity="0.78"
      />
      <circle cx="16" cy="16" r="2.75" fill={`url(#${gradientId})`} />
    </svg>
  );
}
