/**
 * Orvius mark — the integrated OV.
 *
 * A narrow human O shares its final stroke with a decisive V. One compact
 * ligature carries the company initials without a
 * target, signal-wave, speech-bubble, or cube metaphor.
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
      <rect
        className="orvius-mark-monogram"
        x="4"
        y="5"
        width="13"
        height="22"
        rx="6.5"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="orvius-mark-monogram"
        d="M16 5L22 27L28 5"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="bevel"
      />
    </svg>
  );
}
