import { orviusColors } from "@/lib/orvius-colors";

/** Signal-ring mark for OG images and favicons. */
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
        r="12.4"
        stroke={ink}
        strokeWidth="2.65"
        strokeLinecap="round"
        strokeDasharray="68.2 9.8"
        strokeDashoffset="8"
      />
      <circle
        cx="16"
        cy="16"
        r="6.85"
        stroke={ink}
        strokeWidth="1.85"
      />
      <circle cx="25.35" cy="8.05" r="1.35" fill={ink} />
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
