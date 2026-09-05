/**
 * Orvius mark — cut O.
 * Thick geometric ring with a wide horizontal blade (machine-cut).
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
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={`orvius-mark-svg ${className}`.trim()}
      aria-hidden
    >
      <path d="M16 1.5c8.008 0 14.5 6.492 14.5 14.5H26A10 10 0 0 0 16 6 10 10 0 0 0 6 16H1.5C1.5 7.992 7.992 1.5 16 1.5Zm0 8A6.5 6.5 0 0 1 22.5 16h-3.25A3.25 3.25 0 0 0 16 12.75 3.25 3.25 0 0 0 12.75 16H9.5A6.5 6.5 0 0 1 16 9.5Z" />
      <path d="M1.5 16c0 8.008 6.492 14.5 14.5 14.5S30.5 24.008 30.5 16H26A10 10 0 0 1 16 26 10 10 0 0 1 6 16H1.5Zm8 0h3.25A3.25 3.25 0 0 0 16 19.25 3.25 3.25 0 0 0 19.25 16H22.5A6.5 6.5 0 0 1 16 22.5 6.5 6.5 0 0 1 9.5 16Z" />
    </svg>
  );
}
