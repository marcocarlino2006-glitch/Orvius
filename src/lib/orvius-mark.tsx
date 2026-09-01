/**
 * Orvius mark — bold open ring. Monochrome. No frame.
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
      <circle
        className="orvius-mark-ring"
        cx="16"
        cy="16"
        r="10.5"
        strokeWidth="2.5"
        strokeDasharray="58 8"
        strokeLinecap="round"
        transform="rotate(90 16 16)"
      />
    </svg>
  );
}
