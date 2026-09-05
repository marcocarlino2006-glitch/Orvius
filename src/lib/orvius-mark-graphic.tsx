import { orviusColors } from "@/lib/orvius-colors";

/** Solid O for OG images and favicons. */
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
      <circle
        cx="16"
        cy="16"
        r="12.25"
        stroke={ink}
        strokeWidth="3.5"
      />
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
