import type { Metadata } from "next";
import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { PublicDemo } from "@/components/public-demo";
import { publicScenarios } from "@/lib/public-demo";

export const metadata: Metadata = {
  title: "Watch Orvius run an HVAC shop",
  description:
    "Pick a call: no cooling, gas smell, a text that bounces. Watch Orvius check the schedule, book or hold the job and log every step. No account needed.",
};

export default function DemoPage() {
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap" style={{ maxWidth: "64rem" }}>
          <ShellPageIntro
            label="Live demo · no account"
            title="Watch Orvius run the shop."
            subline="Six real calls. One click each."
            description="Every call goes through the real pipeline: playbook, schedule check, booking, confirmation, owner alerts and an audit trail you can read."
          />
          <div style={{ marginTop: "2rem" }}>
            <PublicDemo scenarios={publicScenarios()} />
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
