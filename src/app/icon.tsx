import { OrviusMarkGraphic } from "@/lib/orvius-mark-graphic";
import { orviusColors } from "@/lib/orvius-colors";
import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 8,
        }}
      >
        <OrviusMarkGraphic size={28} gradientId="orvius-icon" coreId="orvius-icon-core" />
      </div>
    ),
    { ...size },
  );
}
