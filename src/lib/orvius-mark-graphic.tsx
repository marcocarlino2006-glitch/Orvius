import { orviusColors } from "@/lib/orvius-colors";

/** Static signal-vector mark for social images and favicons — inline colors. */
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
        d="M2 4 13 8l2 21-5-9 1-6-6-2-3-8Zm28 0L19 8l-2 21 5-9-1-6 6-2 3-8Z"
      />
      <path
        fill={orviusColors.signal}
        d="m15 7 1-3 1 3 1 22-2 3-2-3 1-22Z"
      />
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
