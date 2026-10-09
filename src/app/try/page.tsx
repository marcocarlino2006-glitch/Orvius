import Link from "next/link";
import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { ShopPreviewForm } from "@/components/shop-preview-form";
import { DemoLineBusy } from "@/components/demo-line-busy";
import { TalkInBrowser } from "@/components/talk-in-browser";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";
import { isPreviewLive } from "@/lib/preview-live";
import type { Metadata } from "next";
import { SIGNUP_HREF } from "@/lib/signup-href";

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
            subline="Two free calls. No card, no account."
            description="Type your business name and talk to it in your browser, like a customer calling you. Orvius answers as your business, takes down the job, and shows you the text you'd get after every call."
          />
          <TalkInBrowser personal phoneHref={demoLineHref()} phoneDisplay={DEMO_LINE_DISPLAY} />
          <div className="tier1-form-slot" style={{ marginTop: "1.5rem" }}>
            {live ? (
              <>
                <p className="pd-scenario-sub">Or call from your phone instead:</p>
                <ShopPreviewForm />
              </>
            ) : (
              <div className="shop-preview-actions">
                <a href={demoLineHref()} className="ov-btn ov-btn--solid">
                  Call the live line
                </a>
                <Link href={SIGNUP_HREF} className="ov-btn ov-btn--quiet">
                  Get started
                </Link>
                <DemoLineBusy />
              </div>
            )}
          </div>
          <p className="pd-scenario-sub" style={{ marginTop: "1.25rem" }}>
            Rather click than call? <Link href="/watch">Watch Orvius run a demo HVAC shop</Link>, no account needed.
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
