/**
 * Orvius mark — X.com energy, single glyph: a bold O.
 * Stark, black, readable at favicon size. No chrome clutter.
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
      {/* Bold O ring — evenodd punch for X-level presence */}
      <path
        className="orvius-mark-o"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M16 2.5C8.544 2.5 2.5 8.544 2.5 16S8.544 29.5 16 29.5 29.5 23.456 29.5 16 23.456 2.5 16 2.5Zm0 6.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5Z"
      />
    </svg>
  );
}
