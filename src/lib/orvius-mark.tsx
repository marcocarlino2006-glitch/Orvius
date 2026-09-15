/**
 * Orvius mark — the live visor.
 *
 * A single horizontal operating loop uses an offset inner counter and one live
 * signal segment. The asymmetry gives Orvius forward motion while preserving
 * the severe simplicity that makes infrastructure marks durable.
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
        className="orvius-mark-visor"
        fill="currentColor"
        fillRule="evenodd"
        d="M11 5h9c6.627 0 12 4.925 12 11s-5.373 11-12 11h-9C4.925 27 0 22.075 0 16S4.925 5 11 5Zm-.5 7h12a4 4 0 1 1 0 8h-12a4 4 0 1 1 0-8Z"
      />
      <path
        className="orvius-mark-beam"
        d="M10.5 16h6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
