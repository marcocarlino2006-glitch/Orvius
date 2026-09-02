import { OrviusMarkSvg } from "@/lib/orvius-mark";
import { orviusColors } from "@/lib/orvius-colors";

/** Static mark for OG images and favicons — inline colors (no CSS vars). */
export function OrviusMarkGraphic({
  size = 32,
  variant = "dark",
}: {
  size?: number;
  variant?: "dark" | "light";
}) {
  const tile = variant === "dark" ? orviusColors.void : orviusColors.chalk;
  const ring = variant === "dark" ? orviusColors.chalk : orviusColors.void;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="3" y="3" width="26" height="26" rx="8" fill={tile} />
      <circle
        cx="16"
        cy="16"
        r="8.25"
        stroke={ring}
        strokeWidth="2.25"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="22.75" cy="9.75" r="2.1" fill={orviusColors.signal} />
    </svg>
  );
}

/** Re-export for pages that use CSS-driven mark. */
export { OrviusMarkSvg };
