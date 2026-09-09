/**
 * Orvius mark — the open OV.
 *
 * The open counter keeps the O human while its missing edge resolves into a
 * decisive V. One compact ligature carries the company initials without a
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
      <path
        className="orvius-mark-monogram"
        d="M16 5H11C7 5 5 8 5 12V20C5 24 7 27 11 27H16"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="square"
      />
      <path
        className="orvius-mark-monogram"
        d="M16.5 5.5L22 26.5L27.5 5.5"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="bevel"
      />
    </svg>
  );
}
