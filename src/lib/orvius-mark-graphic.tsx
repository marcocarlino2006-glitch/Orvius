import { orviusColors } from "@/lib/orvius-colors";

/** Static mark for OG images and favicons — the mastered circle, inline colors. */
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
        fillRule="evenodd"
        clipRule="evenodd"
        fill={ink}
        d="M16 1.25C7.853 1.25 1.25 7.853 1.25 16S7.853 30.75 16 30.75 30.75 24.147 30.75 16 24.147 1.25 16 1.25Zm0 8.1a6.65 6.65 0 1 0 0 13.3 6.65 6.65 0 0 0 0-13.3Z"
      />
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
