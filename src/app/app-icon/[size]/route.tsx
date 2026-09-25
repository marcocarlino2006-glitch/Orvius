import { ImageResponse } from "next/og";
import { OrviusMarkGraphic } from "@/lib/orvius-mark-graphic";
import { orviusColors } from "@/lib/orvius-colors";

const SIZES = new Set([192, 512]);

export async function GET(request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  // Maskable icons get cropped to a circle or squircle, so the mark sits inside the safe zone.
  const maskable = new URL(request.url).searchParams.has("maskable");
  const mark = Math.round(size * (maskable ? 0.5 : 0.72));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: orviusColors.void,
        }}
      >
        <OrviusMarkGraphic size={mark} variant="dark" />
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
