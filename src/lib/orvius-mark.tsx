/**
 * Orvius mark — signal ring on ink tile.
 * Reads as live line + O-monogram at favicon size. Not a placeholder pause icon.
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
      <rect
        className="orvius-mark-tile"
        x="3"
        y="3"
        width="26"
        height="26"
        rx="8"
      />
      <circle
        className="orvius-mark-ring"
        cx="16"
        cy="16"
        r="8.25"
        strokeWidth="2.25"
      />
      <circle className="orvius-mark-signal" cx="22.75" cy="9.75" r="2.1" />
    </svg>
  );
}
