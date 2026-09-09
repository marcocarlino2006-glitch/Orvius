import { orviusColors } from "@/lib/orvius-colors";

/** Static integrated-OV monogram for social images and favicons — inline colors. */
export function OrviusMarkGraphic({
  size = 32,
  variant = "dark",
}: {
  size?: number;
  variant?: "dark" | "light";
}) {
  const ink = variant === "dark" ? orviusColors.signal : orviusColors.void;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect
        x="4"
        y="5"
        width="13"
        height="22"
        rx="6.5"
        stroke={ink}
        strokeWidth="4"
      />
      <path
        d="M16 5L22 27L28 5"
        stroke={ink}
        strokeWidth="4"
        strokeLinejoin="bevel"
      />
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
