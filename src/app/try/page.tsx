import Link from "next/link";
import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { ShopPreviewForm } from "@/components/shop-preview-form";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";
import { isPreviewLive } from "@/lib/preview-live";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hear your business answer",
  description:
    "Type your business name, pick your industry, call from your phone, and hear Orvius answer as your business before you pay.",
};

export default function TryPage() {
  const live = isPreviewLive();
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap" style={{ maxWidth: "40rem" }}>
          <ShellPageIntro
            label="Free preview"
            title="Hear your business answer."
            subline={live ? "Two free calls. No card, no account." : "Opening soon."}
            description={
              live
                ? "Tell us your business name and call from your mobile. Orvius answers as your business, takes the call, and texts you the card you'd get for every call."
                : `Personal previews aren't open yet. Call ${DEMO_LINE_DISPLAY} to hear Orvius answer for a demo business, or set up your own line now.`
            }
          />
          <div className="tier1-form-slot" style={{ marginTop: "1.5rem" }}>
            {live ? (
              <ShopPreviewForm />
            ) : (
              <div className="shop-preview-actions">
                <a href={demoLineHref()} className="ov-btn ov-btn--solid">
                  Call the live line
                </a>
                <Link href="/signin?mode=signup" className="ov-btn ov-btn--quiet">
                  Get started
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
