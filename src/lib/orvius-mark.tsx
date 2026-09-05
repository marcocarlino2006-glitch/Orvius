/**
 * Orvius mark — signal O alone (same letter as in the wordmark).
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
      viewBox="0 0 72 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`orvius-mark-svg ${className}`.trim()}
      aria-hidden
    >
      <path
        d="M57.4 19.4 A29 29 0 1 1 46.2 10.8"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <circle
        cx="36"
        cy="36"
        r="12.25"
        stroke="currentColor"
        strokeWidth="5"
      />
    </svg>
  );
}
