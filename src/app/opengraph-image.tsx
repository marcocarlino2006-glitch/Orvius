import { OrviusMarkGraphic } from "@/lib/orvius-mark-graphic";
import { orviusColors } from "@/lib/orvius-colors";
import { company } from "@/lib/company";
import { DEMO_LINE_DISPLAY } from "@/lib/demo-line";
import { ImageResponse } from "next/og";

export const alt = "Orvius — Turn missed calls into booked jobs";
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
              fontSize: 28,
              fontWeight: 700,
              color: orviusColors.void,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {company.productName}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              fontSize: 56,
              fontWeight: 600,
              color: orviusColors.void,
              letterSpacing: "-0.02em",
              lineHeight: 1.08,
              maxWidth: 900,
            }}
          >
            Turn missed calls into booked jobs.
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
              fontSize: 26,
              lineHeight: 1.4,
              color: orviusColors.ash,
            }}
          >
            {DEMO_LINE_DISPLAY} · After-hours · qualify · book · alert
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
          <span>{company.trades.join(" · ")}</span>
          <span>{company.domain}</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
