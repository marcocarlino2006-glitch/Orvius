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
          background: `linear-gradient(165deg, ${orviusColors.fog} 0%, ${orviusColors.chalk} 100%)`,
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
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 22,
                fontWeight: 600,
                color: orviusColors.void,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              Orvius
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
              fontSize: 72,
              fontWeight: 600,
              color: orviusColors.void,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              lineHeight: 1.05,
              maxWidth: 900,
            }}
          >
            Never miss the front door.
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
              color: orviusColors.ash,
              letterSpacing: "-0.02em",
            }}
          >
            Call +1 844 643 9170 · orvius.im
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
