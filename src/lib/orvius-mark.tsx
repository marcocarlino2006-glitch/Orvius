/**
 * Orvius mark — line inside frame. Warm ink. Flat.
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
        x="5"
        y="5"
        width="22"
        height="22"
        rx="6"
        strokeWidth="1.75"
      />
      <path
        className="orvius-mark-line"
        d="M16 11v10"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
