import { SiteFooter } from "@/components/site-footer";
import { EarlyAccessForm } from "@/components/early-access-form";
import Link from "next/link";

export default function PilotPage() {
  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link
            href="/"
            className="font-display text-xl font-700 text-ink"
            style={{ fontWeight: 700 }}
          >
            Orvius
          </Link>
          <Link href="/" className="text-sm text-muted hover:text-ink">
            Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-16 md:py-24">
        <h1 className="font-display text-4xl font-700 leading-tight md:text-5xl">
          Get Orvius answering your calls this week
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-muted">
          Free 30-day pilot for 10 home service businesses. We set it up with
          you — no credit card.
        </p>

        <div className="mt-10 border border-line bg-paper p-6 md:p-8">
          <EarlyAccessForm variant="full" />
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
