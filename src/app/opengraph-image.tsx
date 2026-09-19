import { brandWordmark } from "@/lib/brand-typography";
import { company } from "@/lib/company";
import { DEMO_LINE_DISPLAY } from "@/lib/demo-line";
import { ImageResponse } from "next/og";

export const alt = `Orvius — ${company.tagline.replace(/\.$/, "")}`;
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
          background: "#23262b",
          padding: "72px 80px",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 42,
            fontWeight: 800,
            color: "#f4f6f9",
            letterSpacing: "-0.08em",
            textTransform: "lowercase",
            lineHeight: 0.9,
          }}
        >
          {brandWordmark}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              fontSize: 56,
              fontWeight: 600,
              color: "#f4f6f9",
              letterSpacing: "-0.02em",
              lineHeight: 1.08,
              maxWidth: 900,
            }}
          >
            {company.tagline}
          </div>
          <div
            style={{
              display: "flex",
              width: 48,
              height: 1,
              background: "rgba(244,246,249,0.22)",
            }}
          />
          <div
            style={{
              display: "flex",
              maxWidth: 720,
              fontSize: 26,
              lineHeight: 1.4,
              color: "rgba(244,246,249,0.62)",
            }}
          >
            Call the live product. Capture the request, propose an open window,
            and alert the owner.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "rgba(244,246,249,0.5)",
            fontSize: 20,
          }}
        >
          <span>{DEMO_LINE_DISPLAY}</span>
          <span>{company.domain}</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
