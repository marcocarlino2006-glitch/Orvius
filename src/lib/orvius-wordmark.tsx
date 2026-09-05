/**
 * Orvius wordmark — one company name.
 * Custom geometric ORVIUS. Signal-ring O is the first letter of the word,
 * stroke weight matched to the solid caps so it reads as a name, not a badge.
 */

export type OrviusWordmarkSvgProps = {
  className?: string;
  height?: number;
};

const VB_W = 400;
const VB_H = 72;

export function OrviusWordmarkSvg({
  className = "",
  height = 28,
}: OrviusWordmarkSvgProps) {
  const width = Math.round((height * VB_W) / VB_H);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      xmlns="http://www.w3.org/2000/svg"
      className={`orvius-wordmark-svg ${className}`.trim()}
      aria-hidden
    >
      {/* O — letterform signal ring (weight matched to stems) */}
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <path
          d="M57.4 19.4 A29 29 0 1 1 46.2 10.8"
          strokeWidth="9"
        />
        <circle cx="36" cy="36" r="12.25" strokeWidth="5" />
      </g>

      {/* R — stem ~13 wide to match O rail */}
      <path
        fill="currentColor"
        d="M78 8h30c13 0 22.5 8.6 22.5 21 0 8.8-4.8 15.6-12.6 18.6L142 64H127L110.5 44H91v20H78V8Zm13 13v15.5h17.5c5.8 0 9.5-3.4 9.5-8s-3.7-7.5-9.5-7.5H91Z"
      />

      {/* V */}
      <path
        fill="currentColor"
        d="M156 8h15L188 45.5 205 8h15L194 64h-16L156 8Z"
      />

      {/* I */}
      <path fill="currentColor" d="M236 8h13v56h-13V8Z" />

      {/* U */}
      <path
        fill="currentColor"
        d="M268 8h13v31c0 12.2 7.5 19.8 19.8 19.8S320.6 51.2 320.6 39V8h13v31c0 19.8-14 33-32.8 33S268 58.8 268 39V8Z"
      />

      {/* S — kept inside cap height 8–64 */}
      <path
        fill="currentColor"
        d="M385 20C380.5 13 371.5 8.5 360 8.5c-17.5 0-29.5 10-29.5 24.5 0 10 6 16.5 19.5 20l11.5 2.8c6 1.5 8.8 3.5 8.8 7 0 4.6-4.5 7.6-12 7.6-7 0-12-2.8-14.5-7.5l-11.5 6c4.5 8.5 15 13.6 28.5 13.6 19.5 0 32.5-10.5 32.5-26.5 0-11-6.5-17.5-20.5-21l-11.5-3c-6.5-1.7-9.5-3.7-9.5-7.2 0-4.2 4.2-7 10.5-7 6 0 10.5 2.3 13 6.2L385 20Z"
      />
    </svg>
  );
}
