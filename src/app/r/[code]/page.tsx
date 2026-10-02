import Link from "next/link";
import type { Metadata } from "next";
import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";
import { findReferrer } from "@/lib/referrals";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Get your own Orvius line",
  description: "A shop you know answers its phone with Orvius. Hear it answer, then get your own line.",
  robots: { index: false },
};

export default async function ReferralPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const referrer = await findReferrer(code.toLowerCase()).catch(() => null);
  const discount = Boolean(referrer && process.env.ORVIUS_REFERRAL_COUPON_ID?.trim());
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap" style={{ maxWidth: "40rem" }}>
          <ShellPageIntro
            label={referrer ? `Sent by ${referrer.name}` : "Orvius"}
            title={referrer ? `${referrer.name} answers every call with Orvius.` : "Answer every call with Orvius."}
            subline="Your own number and your own AI receptionist, set up in about five minutes."
            description={`It picks up when you can't, books the job on your calendar, and texts you what happened. Call ${DEMO_LINE_DISPLAY} to hear it answer first.${discount ? " Your discount from this link is applied at checkout." : ""}`}
          />
          <div className="shop-preview-actions" style={{ marginTop: "1.5rem" }}>
            <Link href="/signup?callbackUrl=/dashboard/onboarding" className="ov-btn ov-btn--solid">
              Get your line
            </Link>
            <a href={demoLineHref()} className="ov-btn ov-btn--quiet">
              Call the live line
            </a>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
