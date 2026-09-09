/**
 * Orvius mark — the handoff frame.
 *
 * Two opposing routes imply one protected service window: demand enters at
 * the upper left and leaves as an owned job at the lower right. The negative
 * center keeps the mark legible at favicon size without another generic O.
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
        className="orvius-mark-handoff"
        d="M4 4H20V9H9V20H4V4ZM28 28H12V23H23V12H28V28Z"
        fill="currentColor"
      />
    </svg>
  );
}
