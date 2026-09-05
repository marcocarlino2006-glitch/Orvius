import { orviusColors } from "@/lib/orvius-colors";

/** Favicon / OG — same signal ring as the wordmark O. */
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
        d="M25.55 9.55 A12.15 12.15 0 1 1 21.15 5.35"
        stroke={ink}
        strokeWidth="2.9"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="6.35" stroke={ink} strokeWidth="1.85" />
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
