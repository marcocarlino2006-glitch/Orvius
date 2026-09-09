/**
 * Orvius mark — a notched O resolving into a forward V.
 *
 * The human outer curve reads as the incoming call; the lower-right lift
 * turns it into a decisive, forward-moving job record.
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
        className="orvius-mark-monogram"
        fill="currentColor"
        d="M27.2 8.2C24.7 4.1 20.2 1.8 15.2 1.9 7.3 2.1 1.2 8.4 1.4 16.2 1.7 24 7.7 30 15.5 30.2L29.3 13.7 23.8 12.8 14.5 25.5C9.6 24.5 6 20.5 5.8 15.6 5.6 10.7 9.4 6.6 14.4 6.3 18 6.1 21.2 7.9 23 10.9Z"
      />
    </svg>
  );
}
