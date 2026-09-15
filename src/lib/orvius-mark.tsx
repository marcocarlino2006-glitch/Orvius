/**
 * Orvius mark — the open orbit.
 *
 * A near-circular operational loop stays open for one diagonal inbound signal.
 * It carries the geometric confidence of infrastructure brands without using
 * Oracle's horizontal ellipse or Oculus's nested visor.
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
        d="M23.5 5.8A12 12 0 1 0 27.2 21"
        stroke="currentColor"
        strokeWidth="4.75"
        strokeLinecap="square"
      />
      <path
        className="orvius-mark-beam"
        d="m29 6-9.25 9.25"
        stroke="currentColor"
        strokeWidth="3.25"
        strokeLinecap="square"
      />
      <circle
        className="orvius-mark-core"
        cx="17"
        cy="18"
        r="2.25"
        fill="currentColor"
      />
    </svg>
  );
}
