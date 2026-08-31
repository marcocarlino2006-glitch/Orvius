import { OrviusMarkGraphic } from "@/lib/orvius-mark-graphic";
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
          background: `linear-gradient(165deg, #2A1A08 0%, ${orviusColors.void} 42%, #050505 100%)`,
          padding: "72px 80px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <OrviusMarkGraphic size={48} gradientId="orvius-og-mark" />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 28,
                fontWeight: 600,
                color: orviusColors.chalk,
                letterSpacing: "-0.03em",
              }}
            >
              Orvius
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: orviusColors.signalHot,
              }}
            >
              OS
            </div>
          </div>
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
              fontSize: 88,
              fontWeight: 400,
              color: orviusColors.chalk,
              letterSpacing: "-0.04em",
              lineHeight: 0.95,
              maxWidth: 900,
            }}
          >
            Never miss a call again.
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
              fontSize: 32,
              lineHeight: 1.2,
              color: orviusColors.ashSoft,
              letterSpacing: "-0.02em",
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
