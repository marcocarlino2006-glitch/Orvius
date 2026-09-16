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
        d="M11 7H9c-4.5 0-7 3.5-7 9s2.5 9 7 9h2M21 7h2c4.5 0 7 3.5 7 9s-2.5 9-7 9h-2"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="square"
      />
      <path
        className="orvius-mark-beam"
        d="M9.5 16h13"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
