/**
 * Orvius proprietary letterset — the company name IS the logo.
 *
 * One modular stem. Signal-ring O is the first letter (same DNA as favicon).
 * Condensed industrial caps. No cuts in the letters. No badge+label gap.
 */

export type OrviusWordmarkSvgProps = {
  className?: string;
  height?: number;
};

/**
 * Cap box y=10–70 (H=60). Stem ≈ 11.
 * O optical mass matched to stem via dual-rail stroke.
 * Letter rhythm condensed; gaps optically even (~6–8).
 */
const VB_W = 336;
const VB_H = 80;

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
      {/* O — signal letter (matches favicon geometry, scaled to caps) */}
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <path
          d="M56.8 21.6 A27.2 27.2 0 1 1 47 13.2"
          strokeWidth="10.6"
        />
        <circle cx="34.6" cy="40" r="11.6" strokeWidth="5.6" />
      </g>

      {/* R */}
      <path
        fill="currentColor"
        d="M72 10h26.5c12 0 20.4 7.8 20.4 19 0 8-4.4 14.3-11.7 16.9L124.6 70H111.2L97.2 46.5H83V70H72V10Zm11 10.8V36.2h15.3c5.3 0 8.7-3.2 8.7-8s-3.4-7.4-8.7-7.4H83Z"
      />

      {/* V */}
      <path
        fill="currentColor"
        d="M134.5 10h12.4L158.8 49 171 10H183.6L165.8 70h-14.2L134.5 10Z"
      />

      {/* I */}
      <path fill="currentColor" d="M194 10h11v60H194V10Z" />

      {/* U — industrial bowl */}
      <path
        fill="currentColor"
        d="M216.5 10h11v33c0 10.5 6.4 17 16.8 17s16.8-6.5 16.8-17V10h11v33c0 16.8-11.6 27.8-27.8 27.8S216.5 59.8 216.5 43V10Z"
      />

      {/* S — geometric spine, horizontal terminals */}
      <path
        fill="currentColor"
        d="M321.8 21.4c-4-6.3-11.6-10.4-21.4-10.4-15.4 0-26.2 9-26.2 22.2 0 9.1 5.4 15 17.4 18.1l10.2 2.6c5.4 1.3 7.9 3.2 7.9 6.4 0 4.2-4 6.9-10.7 6.9-6.2 0-10.7-2.5-12.9-6.8l-10.3 5.5c4 7.7 13.4 12.3 25.4 12.3 17.3 0 28.9-9.5 28.9-24 0-10-5.8-15.8-18.2-19l-10.2-2.7c-5.8-1.5-8.5-3.3-8.5-6.5 0-3.8 3.7-6.4 9.4-6.4 5.3 0 9.3 2.1 11.6 5.6l10.4-5.5Z"
      />
    </svg>
  );
}
