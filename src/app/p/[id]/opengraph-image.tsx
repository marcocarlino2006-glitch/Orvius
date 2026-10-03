import { ImageResponse } from "next/og";
import { getReplay } from "@/lib/call-replay";
import { OrviusWordmarkGraphic } from "@/lib/orvius-mark-graphic";

export const alt = "Orvius Call Replay";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function ReplayImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const replay = await getReplay(id).catch(() => null);
  const shop = replay?.shopName ?? "your business";
  const firstAi = replay?.turns.find((t) => t.who === "ai")?.text ?? `Thank you for calling ${shop}.`;
  const firstCaller = replay?.turns.find((t) => t.who === "caller")?.text;
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#000", padding: "64px 72px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <OrviusWordmarkGraphic width={220} />
          <div style={{ display: "flex", fontSize: 24, color: "rgba(244,246,249,0.55)", letterSpacing: "0.12em" }}>CALL REPLAY</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: 54, fontWeight: 600, color: "#f4f6f9", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
            {clip(`AI answered the phone as ${shop}.`, 70)}
          </div>
          {firstCaller ? (
            <div style={{ display: "flex", alignSelf: "flex-end", maxWidth: 800, fontSize: 28, color: "#0b0d10", background: "#f4f6f9", borderRadius: 22, padding: "16px 24px" }}>
              {clip(firstCaller, 90)}
            </div>
          ) : null}
          <div style={{ display: "flex", maxWidth: 860, fontSize: 28, color: "#f4f6f9", background: "#1b1e23", borderRadius: 22, padding: "16px 24px" }}>
            {clip(firstAi, 110)}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "rgba(244,246,249,0.62)" }}>Hear yours at orvius.im/try</div>
      </div>
    ),
    size,
  );
}
