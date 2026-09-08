/**
 * Orvius mark — sci-fi hex core. A hexagonal orbit ring + inner frame + signal
 * core, with a cut in the top-right rail (HUD/reticle feel). Reads as a
 * futuristic emblem at any size and holds the "O" enclosure.
 */

export type OrviusMarkSvgProps = {
  className?: string;
  size?: number;
};

export function OrviusMarkSvg({ className = "", size }: OrviusMarkSvgProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`orvius-mark-svg ${className}`.trim()}
      aria-hidden
    >
      {/* Outer hex orbit — open at top-right for a HUD cut */}
      <path
        className="orvius-mark-rail orvius-mark-rail-outer"
        d="M16 2.6 L4.3 9.3 L4.3 22.7 L16 29.4 L27.7 22.7 L27.7 12.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Inner hex frame */}
      <polygon
        className="orvius-mark-rail orvius-mark-rail-inner"
        points="16,9.4 22.1,12.9 22.1,19.9 16,23.4 9.9,19.9 9.9,12.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        opacity="0.5"
      />
      {/* Signal core */}
      <circle
        className="orvius-mark-core"
        cx="16"
        cy="16"
        r="2.9"
        fill="currentColor"
      />
    </svg>
  );
}
