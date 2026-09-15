/**
 * Orvius mark — one call, one decisive route.
 *
 * A heavy V is crossed by one live vertical signal. It reads as Orvius's
 * initial and as an inbound call routed into action. The angular silhouette is
 * deliberately unrelated to the closed oval language used by Oracle.
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
        className="orvius-mark-route"
        fill="currentColor"
        d="M2 4h7.25L16 21.2 22.75 4H30L20.15 27.1C19.45 28.9 17.9 30 16 30s-3.45-1.1-4.15-2.9L2 4Z"
      />
      <path
        className="orvius-mark-signal"
        d="M16 4v13"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
