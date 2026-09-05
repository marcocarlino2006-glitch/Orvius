/**
 * Orvius mark — signal ring (north star).
 * Oura nested jewelry × Palantir aperture precision.
 * Reads as O at 16px; owns the hero at display size.
 */

export type OrviusMarkSvgProps = {
  className?: string;
  size?: number;
};

/**
 * Dual orbital O in a 32 box.
 * Outer rail: near-full ring with one precise NE aperture.
 * Inner rail: unbroken core. No gimmick nodes.
 *
 * Angles: 0° = top, clockwise. Aperture spans ~20°–55°.
 */
export function OrviusMarkSvg({
  className = "",
  size,
}: OrviusMarkSvgProps) {
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
      {/* Outer rail — machine aperture at NE */}
      <path
        className="orvius-mark-rail orvius-mark-rail-outer"
        d="M26.24 8.83 A12.5 12.5 0 1 1 20.28 4.25"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      {/* Inner core — continuous Oura ring */}
      <circle
        className="orvius-mark-rail orvius-mark-rail-inner"
        cx="16"
        cy="16"
        r="6.55"
        stroke="currentColor"
        strokeWidth="1.75"
      />
    </svg>
  );
}
