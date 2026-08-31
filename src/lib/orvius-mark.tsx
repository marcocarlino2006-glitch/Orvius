/**
 * Orvius mark — Tesla-inspired sci-fi signal: hex frame, arc rings, metallic core.
 * Static only. Shared by logo component, favicon, and OG image.
 */

export type OrviusMarkSvgProps = {
  gradientId: string;
  className?: string;
  size?: number;
};

const CX = 16;
const CY = 16;

function ringDash(r: number) {
  const circ = 2 * Math.PI * r;
  return `${(circ * 0.76).toFixed(3)} ${(circ * 0.24).toFixed(3)}`;
}

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
        <linearGradient id={chromeId} x1="6" y1="4" x2="26" y2="28">
          <stop offset="0%" stopColor="#F2F1ED" />
          <stop offset="38%" stopColor="#B8B6B0" />
          <stop offset="100%" stopColor="#6F6E69" />
        </linearGradient>
        <linearGradient id={signalId} x1="10" y1="8" x2="22" y2="24">
          <stop offset="0%" stopColor="#FFD4C4" />
          <stop offset="45%" stopColor="#F58868" />
          <stop offset="100%" stopColor="#E05A32" />
        </linearGradient>
        <radialGradient id={coreId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFE8DE" />
          <stop offset="55%" stopColor="#F58868" />
          <stop offset="100%" stopColor="#E05A32" />
        </radialGradient>
        <filter id={glowId} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.1" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Hex chassis — sharp, engineered (no rounded app-icon square) */}
      <polygon
        points="16,1.5 28.5,8.25 28.5,23.75 16,30.5 3.5,23.75 3.5,8.25"
        fill="#141312"
        stroke={`url(#${chromeId})`}
        strokeWidth="0.65"
        strokeLinejoin="round"
      />

      {/* Inner void */}
      <polygon
        points="16,4 26,9.5 26,22.5 16,28 6,22.5 6,9.5"
        fill="#1A1917"
      />

      {/* Cardinal ticks */}
      <path
        d="M16 5.2v2.1M16 24.7v2.1M5.2 16h2.1M24.7 16h2.1"
        stroke={`url(#${chromeId})`}
        strokeWidth="0.55"
        strokeLinecap="round"
        opacity="0.55"
      />

      {/* Four signal rings — dashed arcs, offset like radar */}
      <circle
        cx={CX}
        cy={CY}
        r="11.2"
        stroke={`url(#${chromeId})`}
        strokeWidth="0.55"
        fill="none"
        opacity="0.42"
        strokeDasharray={ringDash(11.2)}
        strokeLinecap="round"
        transform={`rotate(-12 ${CX} ${CY})`}
      />
      <circle
        cx={CX}
        cy={CY}
        r="8.6"
        stroke={`url(#${signalId})`}
        strokeWidth="0.7"
        fill="none"
        opacity="0.58"
        strokeDasharray={ringDash(8.6)}
        strokeLinecap="round"
        transform={`rotate(18 ${CX} ${CY})`}
      />
      <circle
        cx={CX}
        cy={CY}
        r="6"
        stroke={`url(#${signalId})`}
        strokeWidth="0.85"
        fill="none"
        opacity="0.78"
        strokeDasharray={ringDash(6)}
        strokeLinecap="round"
        transform={`rotate(-24 ${CX} ${CY})`}
      />
      <circle
        cx={CX}
        cy={CY}
        r="3.35"
        stroke={`url(#${signalId})`}
        strokeWidth="0.95"
        fill="none"
        opacity="0.92"
        strokeDasharray={ringDash(3.35)}
        strokeLinecap="round"
        transform={`rotate(36 ${CX} ${CY})`}
      />

      {/* Core emitter */}
      <circle
        cx={CX}
        cy={CY}
        r="2.15"
        fill={`url(#${coreId})`}
        filter={`url(#${glowId})`}
      />
      <circle cx={CX} cy={CY} r="0.85" fill="#FFF5F0" opacity="0.95" />
    </svg>
  );
}
