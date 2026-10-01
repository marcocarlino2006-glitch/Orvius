import { OrviusMarkGraphic } from "@/lib/orvius-mark-graphic";
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
          borderRadius: 36,
        }}
      >
        <OrviusMarkGraphic size={132} variant="dark" />
      </div>
    ),
    { ...size },
  );
}
