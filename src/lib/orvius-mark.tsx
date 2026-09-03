/**
 * Orvius mark — the circle.
 * Oracle/Grok energy: one perfect bold O that never leaves the logo.
 * Geometry tuned for favicon → nav → hero. No chrome, no cutouts.
 */

export type OrviusMarkSvgProps = {
  className?: string;
  size?: number;
};

/** Perfect ring: outer R=14, stroke≈6.5 → Oracle-weight O in a 32 box. */
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
      {/*
        Dual-path evenodd ring reads sharper at tiny sizes than stroke-only.
        Outer diameter fills the box; inner hole keeps the O open and bold.
      */}
      <path
        className="orvius-mark-o"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M16 1.25C7.853 1.25 1.25 7.853 1.25 16S7.853 30.75 16 30.75 30.75 24.147 30.75 16 24.147 1.25 16 1.25Zm0 8.1a6.65 6.65 0 1 0 0 13.3 6.65 6.65 0 0 0 0-13.3Z"
      />
    </svg>
  );
}
