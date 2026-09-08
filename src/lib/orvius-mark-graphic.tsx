import { orviusColors } from "@/lib/orvius-colors";

/** Static signal O for OG images and favicons — inline colors, no CSS. */
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
        d="M27.93 13.46 A12.2 12.2 0 1 1 18.54 4.07"
        stroke={ink}
        strokeWidth="2.9"
        strokeLinecap="round"
      />
      <path
        d="M20.99 21.99 A7.8 7.8 0 0 1 9.09 12.16"
        stroke={ink}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="3.4" fill={ink} />
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
