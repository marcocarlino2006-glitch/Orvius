/**
 * Orvius mark — the signal bridge.
 *
 * Two opposing orbital brackets are joined by one live signal. The silhouette
 * preserves horizontal, infrastructure-grade simplicity without reproducing a
 * closed nested visor.
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
        className="orvius-mark-brackets"
        d="M14 7h-3c-5.5 0-9 3.5-9 9s3.5 9 9 9h3M18 7h3c5.5 0 9 3.5 9 9s-3.5 9-9 9h-3"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="square"
      />
      <path
        className="orvius-mark-beam"
        d="M11.5 16h9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
