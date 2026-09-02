import { orviusColors } from "@/lib/orvius-colors";

/** Static mark for OG images and favicons — inline colors (no CSS vars). */
export function OrviusMarkGraphic({
  size = 32,
  variant = "dark",
}: {
  size?: number;
  variant?: "dark" | "light";
}) {
  const tile = variant === "dark" ? orviusColors.void : orviusColors.chalk;
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
        d="M8 2.5H24L29.5 8V24L24 29.5H8L2.5 24V8L8 2.5Z"
        fill={tile}
      />
      <path
        d="M11 6.5H21L25.5 11V21L21 25.5H11L6.5 21V11L11 6.5Z"
        stroke={ink}
        strokeWidth="1.75"
        fill="none"
      />
      <path
        d="M16 11.25L20.75 16L16 20.75L11.25 16L16 11.25Z"
        stroke={ink}
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M16 7.25V9.5M16 22.5V24.75M7.25 16H9.5M22.5 16H24.75"
        stroke={ink}
        strokeWidth="1.5"
        strokeLinecap="square"
      />
      <path
        d="M24.25 6.25L27.1 7.9L24.25 9.55L21.4 7.9L24.25 6.25Z"
        fill={orviusColors.signal}
      />
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
