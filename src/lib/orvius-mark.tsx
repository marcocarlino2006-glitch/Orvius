/**
 * Orvius mark — signal ring.
 * Oura elegance (nested rings) + Palantir precision (aperture cut).
 * Sci-fi, premium, still reads as O at 16px.
 */

export type OrviusMarkSvgProps = {
  className?: string;
  size?: number;
};

/**
 * Nested orbital O in a 32 box.
 * Outer rail opens at NE (sensor aperture).
 * Inner rail is continuous — jewelry core.
 * Hairline accent arc on the aperture for depth.
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
      {/* Outer orbital rail — aperture at ~1 o'clock */}
      <circle
        className="orvius-mark-orbit orvius-mark-orbit-outer"
        cx="16"
        cy="16"
        r="12.4"
        stroke="currentColor"
        strokeWidth="2.65"
        strokeLinecap="round"
        strokeDasharray="68.2 9.8"
        strokeDashoffset="8"
      />
      {/* Inner core ring — continuous (Oura jewelry) */}
      <circle
        className="orvius-mark-orbit orvius-mark-orbit-inner"
        cx="16"
        cy="16"
        r="6.85"
        stroke="currentColor"
        strokeWidth="1.85"
      />
      {/* Aperture node — sci-fi sensor tip */}
      <circle
        className="orvius-mark-node"
        cx="25.35"
        cy="8.05"
        r="1.35"
        fill="currentColor"
      />
    </svg>
  );
}
