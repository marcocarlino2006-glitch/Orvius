/**
 * Orvius cut wordmark — ORVIUS sliced by a wide horizontal blade.
 * Oracle / Palantir / Tesla: geometric caps, wide tracking, words cut up.
 */

export type OrviusWordmarkSvgProps = {
  className?: string;
  height?: number;
};

const VB_W = 360;
const VB_H = 56;

/**
 * Blade opens between y=24 and y=32 (wide machine cut).
 * Letter cells ~54 wide, Tesla-wide gaps.
 */
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
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={`orvius-wordmark-svg ${className}`.trim()}
      aria-hidden
    >
      {/* O — top / bottom ring halves */}
      <path d="M28 2c14.36 0 26 11.64 26 26h-7.5C46.5 17.87 38.13 9.5 28 9.5S9.5 17.87 9.5 28H2C2 13.64 13.64 2 28 2Zm0 14.5c6.35 0 11.5 5.15 11.5 11.5h-6c0-3.04-2.46-5.5-5.5-5.5S22.5 24.96 22.5 28h-6c0-6.35 5.15-11.5 11.5-11.5Z" />
      <path d="M2 28c0 14.36 11.64 26 26 26s26-11.64 26-26h-7.5C46.5 38.13 38.13 46.5 28 46.5S9.5 38.13 9.5 28H2Zm14.5 0h6c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5h6c0 6.35-5.15 11.5-11.5 11.5S16.5 34.35 16.5 28Z" />

      {/* R */}
      <path d="M68 2h20c7.73 0 13.5 5.15 13.5 12.5 0 5.2-2.85 9.15-7.4 10.95L104 24H94.5l-8-8.5H76V2H68Zm8 7.5v7h12.5c2.9 0 4.7-1.6 4.7-3.85S91.4 9.5 88.5 9.5H76Z" />
      <path d="M68 32h8V54H68V32Zm8 0h8.5L96.5 54h9.5L92.5 32H76Z" />

      {/* V */}
      <path d="M118 2h9.5L136 20.5 144.5 2H154L138.5 24h-9L118 2Z" />
      <path d="M131.5 32 136 39.5 140.5 32H150L136 54 122 32h9.5Z" />

      {/* I */}
      <path d="M168 2h10v22H168V2Z" />
      <path d="M168 32h10v22H168V32Z" />

      {/* U */}
      <path d="M194 2h8v22h-8V2Zm24 0h8v22h-8V2Z" />
      <path d="M194 32h8v2.5c0 7.75 5 12.5 13 12.5s13-4.75 13-12.5V32h8v2.5c0 12.1-8.1 20.5-21 20.5S194 46.6 194 34.5V32Z" />

      {/* S — clean geometric cut S */}
      <path d="M292 8.5C289.6 4.8 284.2 2 277 2c-11.2 0-18.5 6.1-18.5 15 0 6.2 3.6 10 12.2 12l7.5 1.7c3.6.8 5.3 2 5.3 4.1V24h8v.2c0-1-.2-1.9-.5-2.8-1.9-5.4-7-8.7-15-10.5l-7-1.55c-3.9-.9-5.8-2.2-5.8-4.4 0-3 3-4.85 7.9-4.85 4.2 0 7.2 1.5 8.6 4L292 8.5Z" />
      <path d="M253.5 41c2.3 4.1 8 6.4 15.5 6.4 8.9 0 14.5-3.85 14.5-9.9 0-5-3.3-7.9-11.1-9.75l-7.6-1.8c-4.4-1-6.5-2.5-6.5-5.15V32h-8v1.2c0 6.4 4 10.4 12.9 12.45l7.7 1.8c4.8 1.15 6.8 2.7 6.8 5.25 0 3.3-3.35 5.35-8.7 5.35-5 0-8.55-1.75-10.1-4.65L253.5 41Z" />
    </svg>
  );
}
