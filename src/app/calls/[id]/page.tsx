import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CallReplayPlayer } from "@/components/call-replay-player";
import { MarketingShell } from "@/components/marketing-shell";
import { getGalleryCall } from "@/lib/call-gallery";
import "../../p/[id]/replay.css";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const call = await getGalleryCall(id).catch(() => null);
  if (!call) return { title: "Real call", robots: { index: false } };
  const title = `A real call Orvius answered for ${call.shopName}`;
  const description = "A real customer call to a working shop, shared by the owner with the caller's permission.";
  return { title, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

export default async function GalleryCallPage({ params }: Props) {
  const { id } = await params;
  const call = await getGalleryCall(id, { countView: true }).catch(() => null);
  if (!call) notFound();
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap rp-wrap">
          <CallReplayPlayer replay={call} />
        </div>
      </section>
    </MarketingShell>
  );
}
