import { orviusColors } from "@/lib/orvius-colors";

/** Favicon / OG — signal O from the wordmark. */
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
      viewBox="0 0 72 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M57.4 19.4 A29 29 0 1 1 46.2 10.8"
        stroke={ink}
        strokeWidth="9"
        strokeLinecap="round"
      />
      <circle cx="36" cy="36" r="12.25" stroke={ink} strokeWidth="5" />
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
