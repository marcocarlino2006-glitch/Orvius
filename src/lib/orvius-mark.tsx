/**
 * Orvius mark — isometric cube (Cursor-style construction): three rhombus
 * faces sharing a center, forming a hexagonal silhouette. Monochrome via
 * currentColor with shaded faces, so it works on light and dark.
 */

export type OrviusMarkSvgProps = {
  className?: string;
  size?: number;
};

export function OrviusMarkSvg({ className = "", size }: OrviusMarkSvgProps) {
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
      {/* Top face */}
      <path
        className="orvius-mark-face orvius-mark-face-top"
        d="M4.6 9.3 L16 2.7 L27.4 9.3 L16 15.9 Z"
        fill="currentColor"
      />
      {/* Left face */}
      <path
        className="orvius-mark-face orvius-mark-face-left"
        d="M4.6 9.3 L16 15.9 L16 29.3 L4.6 22.7 Z"
        fill="currentColor"
        opacity="0.72"
      />
      {/* Right face */}
      <path
        className="orvius-mark-face orvius-mark-face-right"
        d="M27.4 9.3 L27.4 22.7 L16 29.3 L16 15.9 Z"
        fill="currentColor"
        opacity="0.42"
      />
    </svg>
  );
}
