import { orviusColors } from "@/lib/orvius-colors";

/** Static signal-route mark for social images and favicons — inline colors. */
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
        d="M2 4h7.25L16 21.2 22.75 4H30L20.15 27.1C19.45 28.9 17.9 30 16 30s-3.45-1.1-4.15-2.9L2 4Z"
      />
      <path
        d="M16 4v13"
        stroke={ink}
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
