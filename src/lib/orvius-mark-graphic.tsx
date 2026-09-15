import { orviusColors } from "@/lib/orvius-colors";

/** Static signal-aperture mark for social images and favicons — inline colors. */
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
        fill={ink}
        fillRule="evenodd"
        d="M10 2h12c4.418 0 8 3.582 8 8v12c0 4.418-3.582 8-8 8H10c-4.418 0-8-3.582-8-8V10c0-4.418 3.582-8 8-8Zm2 10h8a4 4 0 1 1 0 8h-8a4 4 0 1 1 0-8Z"
      />
      <path
        d="M12.25 16h7.5"
        stroke={ink}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
