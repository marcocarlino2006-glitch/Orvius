/**
 * Orvius mark — minimal monogram. Flat, no gradients. Works at 16px and 512px.
 */

export type OrviusMarkSvgProps = {
  gradientId?: string;
  className?: string;
  size?: number;
};

export function OrviusMarkSvg({
  className = "",
  size,
}: OrviusMarkSvgProps) {
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
      <rect
        className="orvius-mark-frame"
        x="1.5"
        y="1.5"
        width="29"
        height="29"
        rx="8"
      />
      <circle
        className="orvius-mark-ring"
        cx="16"
        cy="16"
        r="8.25"
        strokeWidth="2.25"
      />
    </svg>
  );
}
