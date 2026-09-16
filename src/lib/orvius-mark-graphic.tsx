import { orviusColors } from "@/lib/orvius-colors";

/** Static signal-bridge mark for social images and favicons. */
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
        d="M11 7H9c-4.5 0-7 3.5-7 9s2.5 9 7 9h2M21 7h2c4.5 0 7 3.5 7 9s-2.5 9-7 9h-2"
        stroke={ink}
        strokeWidth="4.5"
        strokeLinecap="square"
      />
      <path
        d="M9.5 16h13"
        stroke={orviusColors.signal}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
