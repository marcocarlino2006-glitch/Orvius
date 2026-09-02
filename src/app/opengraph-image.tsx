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
          background: orviusColors.canvas,
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <OrviusMarkGraphic size={56} variant="light" />
          <div
            style={{
              display: "flex",
              fontSize: 30,
              fontWeight: 600,
              fontFamily: "Georgia, serif",
              color: orviusColors.void,
              letterSpacing: "-0.03em",
            }}
          >
            Orvius
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              fontSize: 64,
              fontWeight: 400,
              color: orviusColors.void,
              letterSpacing: "-0.045em",
              lineHeight: 1.06,
              maxWidth: 900,
            }}
          >
            Call the live line.
          </div>
          <div
            style={{
              display: "flex",
              width: 48,
              height: 1,
              background: orviusColors.hairline,
            }}
          />
          <div
            style={{
              display: "flex",
              maxWidth: 720,
              fontSize: 28,
              lineHeight: 1.4,
              color: orviusColors.ash,
              letterSpacing: "-0.02em",
            }}
          >
            +1 844 643 9170 · The operating system for service businesses
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: orviusColors.ashSoft,
            fontSize: 20,
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
