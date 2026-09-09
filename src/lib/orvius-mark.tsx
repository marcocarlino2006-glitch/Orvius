/**
 * Orvius mark — an open service window drawn as one continuous route.
 *
 * The orthogonal line enters, frames the work, and exits through the opening.
 * Even coordinates and a four-unit stroke keep it crisp at 16, 24, and 48px.
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
        className="orvius-mark-route"
        d="M26 6H6V26H18V16H26"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}
