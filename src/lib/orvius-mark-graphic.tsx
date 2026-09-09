import { orviusColors } from "@/lib/orvius-colors";

/** Static handoff frame for social images and favicons — inline colors, no CSS. */
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
        d="M4 4H20V9H9V20H4V4ZM28 28H12V23H23V12H28V28Z"
        fill={ink}
      />
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
