import { orviusColors } from "@/lib/orvius-colors";

/** Static open-OV monogram for social images and favicons — inline colors. */
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
      <path
        d="M16 5H11C7 5 5 8 5 12V20C5 24 7 27 11 27H16"
        stroke={ink}
        strokeWidth="4"
        strokeLinecap="square"
      />
      <path
        d="M16.5 5.5L22 26.5L27.5 5.5"
        stroke={ink}
        strokeWidth="4"
        strokeLinejoin="bevel"
      />
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
