/**
 * Orvius mark — geometric O. Flat. No gradients.
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
        x="2"
        y="2"
        width="28"
        height="28"
        rx="7"
      />
      <circle
        className="orvius-mark-ring"
        cx="16"
        cy="16"
        r="7"
        strokeWidth="2"
      />
    </svg>
  );
}
