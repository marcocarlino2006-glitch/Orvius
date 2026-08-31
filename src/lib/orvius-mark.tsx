/**
 * Orvius mark — angular sci-fi reticle (Tesla / SpaceX energy).
 * No concentric rings. Static only.
 */

export type OrviusMarkSvgProps = {
  gradientId: string;
  className?: string;
  size?: number;
};

const CX = 16;
const CY = 16;

export function OrviusMarkSvg({
  gradientId,
  className = "",
  size,
}: OrviusMarkSvgProps) {
  const chromeId = `${gradientId}-chrome`;
  const signalId = `${gradientId}-signal`;
  const coreId = `${gradientId}-core`;
  const glowId = `${gradientId}-glow`;

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
        <linearGradient id={chromeId} x1="4" y1="2" x2="28" y2="30">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="35%" stopColor="#C9C7C2" />
          <stop offset="100%" stopColor="#5C5B57" />
        </linearGradient>
        <linearGradient id={signalId} x1="8" y1="6" x2="24" y2="26">
          <stop offset="0%" stopColor="#FFB899" />
          <stop offset="50%" stopColor="#F0704A" />
          <stop offset="100%" stopColor="#C44A28" />
        </linearGradient>
        <radialGradient id={coreId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="40%" stopColor="#F58868" />
          <stop offset="100%" stopColor="#E05A32" />
        </radialGradient>
        <filter id={glowId} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="1.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Angular shield — flat top like Tesla wordmark energy */}
      <path
        d="M16 2.5L27.5 9v14L16 29.5 4.5 23V9L16 2.5Z"
        fill="#121110"
        stroke={`url(#${chromeId})`}
        strokeWidth="0.85"
        strokeLinejoin="miter"
      />

      {/* Inner plate */}
      <path
        d="M16 6L23.5 10.5v11L16 26 8.5 21.5v-11L16 6Z"
        fill="#1A1917"
        stroke={`url(#${chromeId})`}
        strokeWidth="0.35"
        strokeOpacity="0.45"
      />

      {/* Crosshair — precision instrument */}
      <path
        d="M16 8.5v3.2M16 20.3v3.2M8.5 16h3.2M20.3 16h3.2"
        stroke={`url(#${chromeId})`}
        strokeWidth="0.7"
        strokeLinecap="square"
        opacity="0.7"
      />

      {/* Corner brackets — targeting reticle (NOT rings) */}
      <path
        d="M9.5 11.5V9.5H11.5M20.5 11.5V9.5H18.5M20.5 20.5V22.5H18.5M9.5 20.5V22.5H11.5"
        stroke={`url(#${signalId})`}
        strokeWidth="1.35"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />

      {/* Tesla-style angular O — open at bottom, thick strokes */}
      <path
        d="M10.5 13.5C10.5 10.8 12.8 8.8 16 8.8c3.2 0 5.5 2 5.5 4.7v1.2c0 2.2-1.4 3.8-3.4 4.5L16 22.8l-2.1-3.6c-2-0.7-3.4-2.3-3.4-4.5v-1.2Z"
        stroke={`url(#${signalId})`}
        strokeWidth="1.65"
        strokeLinejoin="miter"
        fill="none"
      />

      {/* Motor cross-section nod — center spine */}
      <path
        d="M16 11.2v5.8"
        stroke={`url(#${chromeId})`}
        strokeWidth="0.85"
        strokeLinecap="square"
        opacity="0.85"
      />

      {/* Energy core */}
      <circle
        cx={CX}
        cy={CY}
        r="2.35"
        fill={`url(#${coreId})`}
        filter={`url(#${glowId})`}
      />
      <circle cx={CX} cy={CY} r="0.95" fill="#FFFFFF" opacity="0.95" />
    </svg>
  );
}
