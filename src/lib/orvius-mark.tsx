/**
 * Orvius mark — twin-orbit O (X.com construction: mark alone + O-substitute).
 * Two intentional rails with counter-cut signal gaps. Reads as O at favicon size.
 */

export type OrviusMarkSvgProps = {
  className?: string;
  size?: number;
};

/**
 * Twin-rail O in a 32 box.
 * Outer orbit + inner orbit = signature “two lines.”
 * Gaps sit opposite each other (signal out / signal in) — call-loop metaphor.
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
      {/* Rail 1 — outer orbit (gap NE) */}
      <circle
        className="orvius-mark-rail orvius-mark-rail-outer"
        cx="16"
        cy="16"
        r="12.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="4.1"
        strokeLinecap="round"
        strokeDasharray="66.5 14.6"
        strokeDashoffset="10"
      />
      {/* Rail 2 — inner orbit (gap SW, counter to outer) */}
      <circle
        className="orvius-mark-rail orvius-mark-rail-inner"
        cx="16"
        cy="16"
        r="6.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray="33.5 9.6"
        strokeDashoffset="28"
      />
    </svg>
  );
}
