import { ImageResponse } from "next/og";

export const alt = "Orvius — The front door of your business, always answered";
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
          background: "linear-gradient(165deg, #111211 0%, #0A0B0A 46%, #050505 100%)",
          padding: "72px 80px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: "#E8461C",
            fontSize: 14,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
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
              color: "#F2F1EC",
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
              background: "#E8461C",
            }}
          />
          <div
            style={{
              display: "flex",
              maxWidth: 720,
              fontSize: 36,
              lineHeight: 1.15,
              color: "#F2F1EC",
              letterSpacing: "-0.03em",
            }}
          >
            The front door of your business — always answered.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "#9B9A90",
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
