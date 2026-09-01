import { OrviusMarkSvg } from "@/lib/orvius-mark";

/** Static mark for OG images and favicons. */
export function OrviusMarkGraphic({
  size = 32,
}: {
  size?: number;
  gradientId?: string;
}) {
  return (
    <OrviusMarkSvg
      size={size}
      className="orvius-mark-graphic orvius-mark-graphic-og"
    />
  );
}
