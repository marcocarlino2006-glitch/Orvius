import { orviusColors } from "@/lib/orvius-colors";

/** Static mark for OG images and favicons — isometric cube, inline colors. */
export function OrviusMarkGraphic({
  size = 32,
  variant = "dark",
}: {
  size?: number;
  variant?: "dark" | "light";
}) {
  const ink = variant === "dark" ? orviusColors.chalk : orviusColors.void;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M4.6 9.3 L16 2.7 L27.4 9.3 L16 15.9 Z" fill={ink} />
      <path d="M4.6 9.3 L16 15.9 L16 29.3 L4.6 22.7 Z" fill={ink} fillOpacity="0.72" />
      <path d="M27.4 9.3 L27.4 22.7 L16 29.3 L16 15.9 Z" fill={ink} fillOpacity="0.42" />
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
