import {
  MarketingShell,
  ShellPageIntro,
  ShellVoidPanel,
} from "@/components/marketing-shell";
import { EarlyAccessForm } from "@/components/early-access-form";
import { OwnerAlertCard } from "@/components/owner-alert-card";

export default function PilotPage() {
  return (
    <MarketingShell headerPosition="sticky" cta={false}>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-28 md:px-8 md:pt-32">
        <div className="grid gap-12 lg:grid-cols-[1fr_0.9fr] lg:items-start lg:gap-16">
          <div>
            <ShellPageIntro
              label="Free pilot"
              title="Get Orvius answering your calls this week."
              description="Ten home-service businesses. Thirty days free. We set it up with you — no credit card."
            />

            <ShellVoidPanel className="mt-10 p-6 md:p-8 lg:hidden">
              <EarlyAccessForm variant="full" />
            </ShellVoidPanel>

            <ul className="mt-10 space-y-4 border-t border-white/10 pt-8">
              {[
                "AI answers calls and texts 24/7",
                "Lead capture with owner alerts",
                "Personal onboarding — we do the setup",
              ].map((item) => (
                <li
                  key={item}
                  className="flex gap-3 font-sans text-sm text-ash-soft"
                >
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-flare" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-6">
            <OwnerAlertCard variant="void" />
            <ShellVoidPanel className="hidden p-6 md:p-8 lg:block">
              <EarlyAccessForm variant="full" />
            </ShellVoidPanel>
          </div>
        </div>
      </main>
    </MarketingShell>
  );
}
