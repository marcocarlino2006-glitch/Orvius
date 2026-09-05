/**
 * Orvius mark — acquisition-grade signal ring.
 * Oura jewelry precision × Palantir restraint.
 * One aperture. No nodes. No drama. Reads as O at 16px.
 */

export type OrviusMarkSvgProps = {
  className?: string;
  size?: number;
};

/**
 * Nested orbital O.
 * Outer rail nearly closed (small NE aperture).
 * Inner rail continuous.
 * Geometry tuned for favicon + hero.
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
      {/* Outer — aperture ~28° at NE (money, not gamer) */}
      <path
        d="M25.55 9.55 A12.15 12.15 0 1 1 21.15 5.35"
        stroke="currentColor"
        strokeWidth="2.9"
        strokeLinecap="round"
      />
      {/* Inner core */}
      <circle
        cx="16"
        cy="16"
        r="6.35"
        stroke="currentColor"
        strokeWidth="1.85"
      />
    </svg>
  );
}
