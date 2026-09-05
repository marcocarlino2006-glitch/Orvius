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
      <path
        d="M26.24 8.83 A12.5 12.5 0 1 1 20.28 4.25"
        stroke={ink}
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <circle
        cx="16"
        cy="16"
        r="6.55"
        stroke={ink}
        strokeWidth="1.75"
      />
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
