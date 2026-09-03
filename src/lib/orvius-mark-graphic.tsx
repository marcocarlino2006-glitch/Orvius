import { orviusColors } from "@/lib/orvius-colors";

/** Static mark for OG images and favicons — bold O, inline colors. */
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
        d="M16 2.5C8.544 2.5 2.5 8.544 2.5 16S8.544 29.5 16 29.5 29.5 23.456 29.5 16 23.456 2.5 16 2.5Zm0 6.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5Z"
      />
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
