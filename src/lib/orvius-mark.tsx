/**
 * Orvius mark — the signal aperture.
 *
 * A precision rounded-square aperture (the O) holds a five-bar call waveform
 * whose valley falls to a point (the V). The initials are still there, but the
 * mark now reads as what the product is: a live line being watched. Every
 * coordinate sits on a 32-unit grid at half-unit precision so the emblem stays
 * crisp at favicon scale.
 */

const APERTURE = { x: 2.5, y: 2.5, size: 27, radius: 7.5, stroke: 2.25 } as const;
const BAR_STROKE = 2.25;

/**
 * Bar half-heights, symmetric around the centre line: tall shoulders falling to
 * a point. This is the V, drawn as signal rather than as a letter.
 */
const BARS: { x: number; half: number }[] = [
  { x: 9, half: 6 },
  { x: 12.5, half: 3.9 },
  { x: 16, half: 1.6 },
  { x: 19.5, half: 3.9 },
  { x: 23, half: 6 },
];

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
      <rect
        className="orvius-mark-aperture"
        x={APERTURE.x}
        y={APERTURE.y}
        width={APERTURE.size}
        height={APERTURE.size}
        rx={APERTURE.radius}
        stroke="currentColor"
        strokeWidth={APERTURE.stroke}
      />
      {BARS.map((bar) => (
        <line
          key={bar.x}
          className="orvius-mark-bar"
          x1={bar.x}
          y1={16 - bar.half}
          x2={bar.x}
          y2={16 + bar.half}
          stroke="currentColor"
          strokeWidth={BAR_STROKE}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
