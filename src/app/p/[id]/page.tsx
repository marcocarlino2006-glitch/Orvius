import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CallReplayPlayer } from "@/components/call-replay-player";
import { MarketingShell } from "@/components/marketing-shell";
import { getReplay } from "@/lib/call-replay";
import "./replay.css";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const replay = await getReplay(id).catch(() => null);
  if (!replay) return { title: "Call Replay", robots: { index: false } };
  const title = `Orvius answered the phone as ${replay.shopName}`;
  const description = "An AI receptionist picked up as this business. Watch the call, then hear yours.";
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, type: "video.other" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ReplayPage({ params }: Props) {
  const { id } = await params;
  const replay = await getReplay(id, { countView: true }).catch(() => null);
  if (!replay) notFound();
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap rp-wrap">
          <CallReplayPlayer replay={replay} />
        </div>
      </section>
    </MarketingShell>
  );
}
