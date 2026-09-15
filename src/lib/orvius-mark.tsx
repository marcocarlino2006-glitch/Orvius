/**
 * Orvius mark — the signal vector.
 *
 * Two swept vectors converge around one live beam: an inbound transmission
 * becoming decisive motion. The separated geometry stays recognizable without
 * collapsing into a generic letter or app tile.
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
        className="orvius-mark-vector"
        fill="currentColor"
        d="M2 4 13 8l2 21-5-9 1-6-6-2-3-8Zm28 0L19 8l-2 21 5-9-1-6 6-2 3-8Z"
      />
      <path
        className="orvius-mark-beam"
        fill="currentColor"
        d="m15 7 1-3 1 3 1 22-2 3-2-3 1-22Z"
      />
    </svg>
  );
}
