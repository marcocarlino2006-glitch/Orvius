/**
 * Orvius mark — a protected signal frame.
 *
 * The clipped frame conveys a durable operating boundary. The asymmetric
 * voiceprint inside carries the signal without relying on broadcast arcs.
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
        className="orvius-mark-frame"
        d="M10 4H22L28 10V22L22 28H10L4 22V10L10 4Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        className="orvius-mark-voice"
        d="M10 14.5V17.5M14 11.5V20.5M18 9V23M22 12V20M26 14.5V17.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
