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
        d="M14 7h-3c-5.5 0-9 3.5-9 9s3.5 9 9 9h3M18 7h3c5.5 0 9 3.5 9 9s-3.5 9-9 9h-3"
        stroke={ink}
        strokeWidth="4.5"
        strokeLinecap="square"
      />
      <path
        d="M11.5 16h9"
        stroke={orviusColors.signal}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
