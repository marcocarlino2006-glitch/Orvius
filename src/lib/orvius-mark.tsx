/**
 * Orvius mark v2 — MACHINE FACE keyway.
 * Rounded-square frame + core + NE notch cut into the outline.
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
      xmlns="http://www.w3.org/2000/svg"
      className={`orvius-mark-svg ${className}`.trim()}
      aria-hidden
    >
      <g fill="currentColor" fillRule="evenodd">
        <path d="M9 2C5.13 2 2 5.13 2 9v14c0 3.87 3.13 7 7 7h14c3.87 0 7-3.13 7-7v-6l-4-4V9c0-1.9-.8-3.6-2-4.8L26 2H9zM8 11c0-2.76 2.24-5 5-5h6c2.76 0 5 2.24 5 5v10c0 2.76-2.24 5-5 5h-6c-2.76 0-5-2.24-5-5V11z" />
        <circle cx="16" cy="16" r="3.6" />
      </g>
    </svg>
  );
}
