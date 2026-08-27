import { SiteFooter } from "@/components/site-footer";
import { EarlyAccessForm } from "@/components/early-access-form";
import { ProfileMenu } from "@/components/profile-menu";
import Link from "next/link";

export default function PilotPage() {
  return (
    <>
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5 md:px-8">
          <Link
            href="/"
            className="font-sans text-[1.05rem] font-medium tracking-tight text-ink"
          >
            Orvius
          </Link>
          <Link href="/" className="font-sans text-sm text-muted hover:text-ink">
            Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-16 md:py-24">
        <p className="font-sans text-sm font-medium tracking-[0.16em] text-muted uppercase">
          Free pilot
        </p>
        <h1 className="mt-4 font-serif text-4xl leading-[1.1] tracking-[-0.03em] text-ink md:text-5xl">
          Get Orvius answering your calls this week.
        </h1>
        <p className="mt-6 font-serif text-xl leading-relaxed text-muted">
          Ten home-service businesses. Thirty days free. We set it up with you —
          no credit card.
        </p>

        <div className="mt-10 rounded-2xl border border-line bg-paper p-6 md:p-8">
          <EarlyAccessForm variant="full" />
        </div>

        <ul className="mt-10 space-y-3 font-serif text-base text-muted">
          <li>AI answers calls and texts 24/7</li>
          <li>Lead capture with owner alerts</li>
          <li>Personal onboarding — we do the setup</li>
        </ul>
      </main>

      <SiteFooter />
      <ProfileMenu statusLabel="Founder workspace" />
    </>
  );
}
