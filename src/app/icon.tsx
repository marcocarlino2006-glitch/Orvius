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
          background: `linear-gradient(135deg, ${orviusColors.signalHot} 0%, ${orviusColors.signal} 55%, ${orviusColors.signalDim} 100%)`,
          borderRadius: 8,
        }}
      >
        <div
          style={{
          color: orviusColors.void,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "-0.06em",
          }}
        >
          O
        </div>
      </div>
    ),
    { ...size },
  );
}
