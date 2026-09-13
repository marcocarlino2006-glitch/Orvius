import { orviusColors } from "@/lib/orvius-colors";

/** Static signal-aperture mark for social images and favicons — inline colors. */
export function OrviusMarkGraphic({
  size = 32,
  variant = "dark",
}: {
  size?: number;
  variant?: "dark" | "light";
}) {
  const ink = variant === "dark" ? orviusColors.signal : orviusColors.void;
  const bars = [
    { x: 9, half: 6 },
    { x: 12.5, half: 3.9 },
    { x: 16, half: 1.6 },
    { x: 19.5, half: 3.9 },
    { x: 23, half: 6 },
  ];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect
        x="2.5"
        y="2.5"
        width="27"
        height="27"
        rx="7.5"
        stroke={ink}
        strokeWidth="2.25"
      />
      {bars.map((bar) => (
        <line
          key={bar.x}
          x1={bar.x}
          y1={16 - bar.half}
          x2={bar.x}
          y2={16 + bar.half}
          stroke={ink}
          strokeWidth="2.25"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

export { OrviusMarkSvg } from "@/lib/orvius-mark";
