import { orviusColors } from "@/lib/orvius-colors";

/** Static mark for OG images and favicons — twin-orbit O, inline colors. */
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
        r="13.15"
        fill="none"
        stroke={ink}
        strokeWidth="2.85"
        strokeLinecap="round"
        strokeDasharray="68.5 14.1"
        strokeDashoffset="10"
      />
      <circle
        cx="16"
        cy="16"
        r="7.05"
        fill="none"
        stroke={ink}
        strokeWidth="2.45"
        strokeLinecap="round"
        strokeDasharray="35.2 9.1"
        strokeDashoffset="28"
      />
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
