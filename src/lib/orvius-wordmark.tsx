type OrviusWordmarkSvgProps = {
  className?: string;
};

/**
 * Engineered display lettering for the identity. The open strokes and cut R
 * keep ORVIUS legible in navigation while giving it a title-card silhouette
 * that does not depend on a licensed display font.
 */
export function OrviusWordmarkSvg({
  className = "",
}: OrviusWordmarkSvgProps) {
  return (
    <svg
      viewBox="0 0 170 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`orvius-wordmark-svg ${className}`.trim()}
      aria-hidden
    >
      <path
        d="M9 5h10c4 0 6 2 6 6v10c0 4-2 6-6 6H9c-4 0-6-2-6-6V11c0-4 2-6 6-6Z"
      />
      <path d="M34 27V5h13c5 0 8 2.5 8 7s-3 7-8 7H34m12 0 10 8" />
      <path d="m64 5 11 22L86 5" />
      <path d="M96 5v22" />
      <path d="M107 5v14c0 5 3 8 9 8s9-3 9-8V5" />
      <path d="M165 7c-3-2-7-2-12-2-6 0-9 2.5-9 6.5s3 6.5 9 6.5h3c6 0 9 1.5 9 5s-3 5-9 5h-12" />
    </svg>
  );
}
