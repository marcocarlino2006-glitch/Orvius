import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { ShopPreviewForm } from "@/components/shop-preview-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hear your shop answer",
  description: "Type your shop name, call from your phone, and hear Orvius answer as your HVAC shop before you pay.",
};

export default function TryPage() {
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap" style={{ maxWidth: "40rem" }}>
          <ShellPageIntro
            label="Free preview"
            title="Hear your shop answer."
            subline="Two free calls. No card, no account."
            description="Tell us your shop name and call from your mobile. Orvius answers as your shop, takes the job, and texts you the card you'd get for every call."
          />
          <div className="tier1-form-slot" style={{ marginTop: "1.5rem" }}>
            <ShopPreviewForm />
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
