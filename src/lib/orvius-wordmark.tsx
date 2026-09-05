/**
 * Orvius proprietary letterset v2 — MACHINE FACE.
 *
 * Not the nested-ring lockup. Squared industrial nameplate:
 * keyway O, square-bowl R, channel U, stepped S.
 */

export type OrviusWordmarkSvgProps = {
  className?: string;
  height?: number;
};

const VB_W = 372;
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
      {/*
        O — rounded-square frame with built-in NE keyway + solid core.
        Notch is carved into the outline (not an exterior tab).
      */}
      <g fill="currentColor" fillRule="evenodd">
        <path d="M22 6c-8.84 0-16 7.16-16 16v36c0 8.84 7.16 16 16 16h24c8.84 0 16-7.16 16-16V36l-8-8V22c0-4.4-1.8-8.4-4.7-11.3L56 6H22zM20 26c0-5.52 4.48-10 10-10h16c5.52 0 10 4.48 10 10v28c0 5.52-4.48 10-10 10H30c-5.52 0-10-4.48-10-10V26z" />
        <circle cx="34" cy="40" r="8" />
      </g>

      {/* R — square bowl + hard diagonal leg */}
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M78 8h30c14 0 23 9 23 22.5 0 10-5 17.5-13.2 20.5L132 72h-16.5L102.2 53H90v19H78V8zm12 12h18c6.5 0 10.5 4 10.5 10.5 0 6.5-4 10.5-10.5 10.5H90V20z"
      />

      {/* V — wide, flat tip */}
      <path
        fill="currentColor"
        d="M148 8h15l14.5 46L192 8h15l-22 64h-17L148 8z"
      />

      {/* I */}
      <path fill="currentColor" d="M218 8h12v64h-12V8z" />

      {/* U — hard channel */}
      <path
        fill="currentColor"
        d="M244 8h12v36c0 10 6 16 17 16s17-6 17-16V8h12v36c0 17.5-12 28-29 28s-29-10.5-29-28V8z"
      />

      {/* S — circuit spine (square joins, machine face) */}
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="12"
        strokeLinecap="square"
        strokeLinejoin="miter"
        d="M318 14h34c8 0 14 6 14 14s-6 14-14 14H330c-8 0-14 6-14 14s6 14 14 14h34"
      />
    </svg>
  );
}
