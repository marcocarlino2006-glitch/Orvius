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
          background: "#0A0B0A",
          borderRadius: 8,
          border: "1px solid rgba(232, 70, 28, 0.35)",
        }}
      >
        <div
          style={{
            color: "#E8461C",
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "-0.04em",
          }}
        >
          O
        </div>
      </div>
    ),
    { ...size },
  );
}
