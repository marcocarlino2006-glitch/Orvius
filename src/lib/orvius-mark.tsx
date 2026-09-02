/**
 * Orvius mark — angular HUD reticle.
 * Reads as command lock + live signal. Sharp at favicon size.
 */

export type OrviusMarkSvgProps = {
  className?: string;
  size?: number;
};

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
      {/* Chamfered tile */}
      <path
        className="orvius-mark-tile"
        d="M8 2.5H24L29.5 8V24L24 29.5H8L2.5 24V8L8 2.5Z"
      />
      {/* Outer reticle octagon */}
      <path
        className="orvius-mark-ring"
        d="M11 6.5H21L25.5 11V21L21 25.5H11L6.5 21V11L11 6.5Z"
        strokeWidth="1.75"
      />
      {/* Inner lock diamond */}
      <path
        className="orvius-mark-core"
        d="M16 11.25L20.75 16L16 20.75L11.25 16L16 11.25Z"
        strokeWidth="1.5"
      />
      {/* Crosshair ticks */}
      <path
        className="orvius-mark-ticks"
        d="M16 7.25V9.5M16 22.5V24.75M7.25 16H9.5M22.5 16H24.75"
        strokeWidth="1.5"
        strokeLinecap="square"
      />
      {/* Live signal node */}
      <path
        className="orvius-mark-signal"
        d="M24.25 6.25L27.1 7.9L24.25 9.55L21.4 7.9L24.25 6.25Z"
      />
    </svg>
  );
}
