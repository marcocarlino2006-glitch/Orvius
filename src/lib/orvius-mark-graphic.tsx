import { orviusColors } from "@/lib/orvius-colors";

/** Static open-orbit mark for social images and favicons — inline colors. */
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
        d="M23.5 5.8A12 12 0 1 0 27.2 21"
        stroke={ink}
        strokeWidth="4.75"
        strokeLinecap="square"
      />
      <path
        d="m29 6-9.25 9.25"
        stroke={orviusColors.signal}
        strokeWidth="3.25"
        strokeLinecap="square"
      />
      <circle cx="17" cy="18" r="2.25" fill={ink} />
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
