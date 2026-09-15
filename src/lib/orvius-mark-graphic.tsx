import { orviusColors } from "@/lib/orvius-colors";

/** Static live-visor mark for social images and favicons. */
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
        d="M11 5h9c6.627 0 12 4.925 12 11s-5.373 11-12 11h-9C4.925 27 0 22.075 0 16S4.925 5 11 5Zm-.5 7h12a4 4 0 1 1 0 8h-12a4 4 0 1 1 0-8Z"
      />
      <path
        d="M10.5 16h6"
        stroke={orviusColors.signal}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
