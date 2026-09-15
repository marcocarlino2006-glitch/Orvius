import { orviusColors } from "@/lib/orvius-colors";

/** Static horizontal signal-loop mark for social images and favicons. */
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
        d="M25 7H10c-4.5 0-7 2.5-7 7v4c0 4.5 2.5 7 7 7h12c4.5 0 7-2.5 7-7v-2"
        stroke={ink}
        strokeWidth="4.5"
        strokeLinecap="square"
      />
      <path
        d="m29 7-7 9"
        stroke={orviusColors.signal}
        strokeWidth="3"
        strokeLinecap="square"
      />
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
