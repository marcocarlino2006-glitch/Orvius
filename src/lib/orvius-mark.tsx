/**
 * Orvius mark — the open line.
 *
 * A single rounded aperture carries one live signal through its centre. The
 * silhouette is deliberately simple enough to survive at 16px, while the open
 * line ties the mark to Orvius's first job: keeping the shop's line moving.
 * It is not a letter trapped in an app tile and it does not need a waveform to
 * explain itself.
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
      <path
        className="orvius-mark-aperture"
        fill="currentColor"
        fillRule="evenodd"
        d="M10 2h12c4.418 0 8 3.582 8 8v12c0 4.418-3.582 8-8 8H10c-4.418 0-8-3.582-8-8V10c0-4.418 3.582-8 8-8Zm2 10h8a4 4 0 1 1 0 8h-8a4 4 0 1 1 0-8Z"
      />
      <path
        className="orvius-mark-line"
        d="M12.25 16h7.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
