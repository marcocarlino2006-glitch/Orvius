import { OrviusMarkSvg } from "@/lib/orvius-mark";

/** Static sci-fi mark for OG images and favicons. */
export function OrviusMarkGraphic({
  size = 32,
  gradientId = "orvius-mark-og",
}: {
  size?: number;
  gradientId?: string;
}) {
  return (
    <OrviusMarkSvg
      gradientId={gradientId}
      size={size}
      className="orvius-mark-graphic"
    />
  );
}
