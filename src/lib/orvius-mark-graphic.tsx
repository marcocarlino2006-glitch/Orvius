import { MARK_PATH, MARK_VIEWBOX, WORDMARK_ASPECT, WORDMARK_PATH, WORDMARK_VIEWBOX } from "@/lib/orvius-wordmark";

/** Static mark for favicons and app icons: the symbol, white on dark or black on light. */
export function OrviusMarkGraphic({
  size = 32,
  variant = "dark",
}: {
  size?: number;
  variant?: "dark" | "light";
}) {
  return (
    <svg width={size} height={size} viewBox={MARK_VIEWBOX} xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d={MARK_PATH} fill={variant === "dark" ? "#ffffff" : "#000000"} fillRule="evenodd" />
    </svg>
  );
}

/** Static wordmark for social images. */
export function OrviusWordmarkGraphic({ width, color = "#ffffff" }: { width: number; color?: string }) {
  return (
    <svg width={width} height={Math.round(width / WORDMARK_ASPECT)} viewBox={WORDMARK_VIEWBOX} xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d={WORDMARK_PATH} fill={color} fillRule="evenodd" />
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
