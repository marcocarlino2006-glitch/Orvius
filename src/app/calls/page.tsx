import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { GalleryGrid } from "@/components/gallery-grid";
import { listGallery } from "@/lib/call-gallery";
import "../p/[id]/replay.css";

/* A launch post sends everyone here at once; rebuild at most once a minute. */
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Real calls Orvius answered",
  description: "Real customer calls to HVAC, plumbing and electrical shops, answered by Orvius and shared by the owners with the callers' permission.",
};

export default async function GalleryPage() {
  const calls = await listGallery(48).catch(() => []);
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Real calls"
            title="Calls Orvius answered for real shops."
            subline="Shared by the owners, with the caller's permission."
            description="Every call here came into a working shop's line. The words are as transcribed; names, numbers and addresses are hidden. Nothing here is staged."
          />
          <GalleryGrid calls={calls} />
          <p className="pd-scenario-sub" style={{ marginTop: "1.5rem" }}>
            Want to hear it yourself? <Link href="/try">Talk to it now</Link>.
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
