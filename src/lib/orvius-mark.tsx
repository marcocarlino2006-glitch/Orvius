import { MARK_PATH, MARK_VIEWBOX } from "@/lib/orvius-wordmark";

/** The Orvius mark: the wordmark's O, with its chamfered counter. */

export type OrviusMarkSvgProps = {
  className?: string;
  size?: number;
};

export function OrviusMarkSvg({ className = "", size }: OrviusMarkSvgProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={MARK_VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      className={`orvius-mark-svg ${className}`.trim()}
      aria-hidden
    >
      <path d={MARK_PATH} fill="currentColor" />
    </svg>
  );
}
