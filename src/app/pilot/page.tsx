import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { EarlyAccessForm } from "@/components/early-access-form";

export default function PilotPage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm uppercase tracking-[0.2em] text-sky-300">
          Free 30-day pilot
        </p>
        <h1 className="mt-4 text-3xl font-semibold md:text-4xl">
          Get Orvius answering your calls this week
        </h1>
        <p className="mt-4 leading-relaxed text-muted">
          We&apos;re onboarding 10 home service businesses. Apply below — if you&apos;re
          a fit, we set up your AI receptionist personally within 48 hours.
        </p>

        <div className="card mt-10 p-8">
          <EarlyAccessForm variant="full" />
        </div>

        <ul className="mt-8 space-y-3 text-sm text-muted">
          <li>✓ AI answers calls + texts 24/7</li>
          <li>✓ Lead capture with owner SMS alerts</li>
          <li>✓ Personal onboarding — we do the setup</li>
          <li>✓ Free for 30 days, no credit card</li>
        </ul>
      </main>
      <SiteFooter />
    </>
  );
}
