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
          background: orviusColors.white,
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
          <OrviusMarkGraphic size={64} gradientId="orvius-og-mark" />
          <div
            style={{
              display: "flex",
              fontSize: 22,
              fontWeight: 600,
              color: orviusColors.void,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
            }}
          >
            ORVIUS
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
              fontSize: 64,
              fontWeight: 600,
              color: orviusColors.void,
              letterSpacing: "-0.035em",
              lineHeight: 1.08,
              maxWidth: 900,
            }}
          >
            Call the live line.
          </div>
          <div
            style={{
              display: "flex",
              width: 64,
              height: 2,
              background: orviusColors.void,
            }}
          />
          <div
            style={{
              display: "flex",
              maxWidth: 720,
              fontSize: 30,
              lineHeight: 1.35,
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
