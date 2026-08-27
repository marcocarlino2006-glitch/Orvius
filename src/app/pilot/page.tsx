import {
  MarketingShell,
  ShellPageIntro,
  ShellVoidPanel,
} from "@/components/marketing-shell";
import { EarlyAccessForm } from "@/components/early-access-form";

export default function PilotPage() {
  return (
    <MarketingShell headerPosition="sticky" cta={false}>
      <main className="mx-auto max-w-2xl px-6 pb-20 pt-28 md:px-8 md:pt-32">
        <ShellPageIntro
          label="Free pilot"
          title="Get Orvius answering your calls this week."
          description="Ten home-service businesses. Thirty days free. We set it up with you — no credit card."
        />

        <ShellVoidPanel className="mt-10 p-6 md:p-8">
          <EarlyAccessForm variant="full" />
        </ShellVoidPanel>

        <ul className="mt-10 space-y-3 border-t border-white/10 pt-8 font-sans text-base text-ash-soft">
          {[
            "AI answers calls and texts 24/7",
            "Lead capture with owner alerts",
            "Personal onboarding — we do the setup",
          ].map((item) => (
            <li key={item} className="flex gap-3">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-flare" />
              {item}
            </li>
          ))}
        </ul>
      </main>
    </MarketingShell>
  );
}
