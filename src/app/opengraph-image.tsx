import { orviusColors } from "@/lib/orvius-colors";
import { ImageResponse } from "next/og";

export const alt = "Orvius — The operating system for service businesses";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: `linear-gradient(165deg, #12332F 0%, ${orviusColors.void} 42%, #050505 100%)`,
          padding: "72px 80px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            color: orviusColors.signalHot,
            fontSize: 14,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              background: `linear-gradient(135deg, ${orviusColors.signalHot}, ${orviusColors.signal})`,
            }}
          />
          Operating system
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 28,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 96,
              fontWeight: 500,
              color: orviusColors.chalk,
              letterSpacing: "-0.06em",
              lineHeight: 0.9,
            }}
          >
            Orvius
          </div>
          <div
            style={{
              display: "flex",
              width: 64,
              height: 2,
              background: orviusColors.signal,
            }}
          />
          <div
            style={{
              display: "flex",
              maxWidth: 720,
              fontSize: 36,
              lineHeight: 1.15,
              color: orviusColors.chalk,
              letterSpacing: "-0.03em",
            }}
          >
            The operating system for service businesses.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: orviusColors.ashSoft,
            fontSize: 22,
          }}
        >
          <span>HVAC · Plumbing · Electrical</span>
          <span>orvius.im</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
