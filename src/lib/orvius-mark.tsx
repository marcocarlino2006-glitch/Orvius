/**
 * Orvius mark — the open orbit.
 *
 * A wide, deliberately open operational loop is completed by one contained
 * signal cut. Its proportions and break keep it distinct from a closed oval.
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
        className="orvius-mark-orbit"
        d="M25 7H10c-4.5 0-7 2.5-7 7v4c0 4.5 2.5 7 7 7h12c4.5 0 7-2.5 7-7v-2"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="square"
      />
      <path
        className="orvius-mark-beam"
        d="m29 7-7 9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="square"
      />
    </svg>
  );
}
