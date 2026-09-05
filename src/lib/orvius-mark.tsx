/**
 * Orvius mark — solid geometric O.
 * Quiet company mark. No cuts, no twin rails.
 */

export type OrviusMarkSvgProps = {
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
        cx="16"
        cy="16"
        r="12.25"
        stroke="currentColor"
        strokeWidth="3.5"
      />
    </svg>
  );
}
