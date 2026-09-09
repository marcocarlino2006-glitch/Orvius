import { orviusColors } from "@/lib/orvius-colors";

/** Static signal frame for OG images and favicons — inline colors, no CSS. */
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
        d="M10 4H22L28 10V22L22 28H10L4 22V10L10 4Z"
        stroke={ink}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M10 14.5V17.5M14 11.5V20.5M18 9V23M22 12V20M26 14.5V17.5"
        stroke={ink}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
