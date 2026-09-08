/**
 * Orvius mark — the signal O.
 *
 * Outer ring: the shop's coverage, broken where the night gap is.
 * Inner sweep: the line answering into that gap.
 * Core: the one record every call, job, and dollar compounds into.
 *
 * Monochrome via currentColor, so it holds on charcoal and on warm light.
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
        className="orvius-mark-coverage"
        d="M27.93 13.46 A12.2 12.2 0 1 1 18.54 4.07"
        stroke="currentColor"
        strokeWidth="2.9"
        strokeLinecap="round"
      />
      <path
        className="orvius-mark-sweep"
        d="M20.99 21.99 A7.8 7.8 0 0 1 9.09 12.16"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle className="orvius-mark-core" cx="16" cy="16" r="3.4" fill="currentColor" />
    </svg>
  );
}
