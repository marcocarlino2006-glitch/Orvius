import { SiteFooter } from "@/components/site-footer";
import { ProfileMenu } from "@/components/profile-menu";
import Link from "next/link";

/**
 * Brand-first homepage:
 * Orvius must survive the brand test — remove the nav and it still reads as Orvius.
 * Tesla-scale wordmark + Anthropic restraint. No images.
 */
export default function HomePage() {
  return (
    <>
      <header className="absolute inset-x-0 top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 md:px-10">
          <Link
            href="/"
            className="font-sans text-sm font-medium tracking-[0.14em] text-ink uppercase"
          >
            Orvius
          </Link>
          <div className="flex items-center gap-8">
            <Link
              href="/dashboard"
              className="hidden font-sans text-sm text-muted transition hover:text-ink md:inline"
            >
              Product
            </Link>
            <Link href="/pilot" className="btn btn-primary">
              Start free pilot
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero — Orvius is the composition */}
        <section className="relative flex min-h-[100svh] items-end bg-paper">
          <div className="mx-auto w-full max-w-6xl px-6 pb-16 pt-28 md:px-10 md:pb-24 md:pt-32">
            <h1 className="animate-rise font-serif text-[clamp(4.5rem,18vw,13rem)] leading-[0.86] tracking-[-0.06em] text-ink">
              Orvius
            </h1>

            <p className="animate-rise-delay mt-8 max-w-2xl font-serif text-2xl leading-snug tracking-[-0.02em] text-ink md:text-4xl md:leading-tight">
              The front door of your business — always answered.
            </p>

            <p className="animate-rise-delay-2 mt-5 max-w-xl font-serif text-lg leading-relaxed text-muted md:text-xl">
              AI operating partner for service businesses. Capture every lead.
              Run with less friction.
            </p>

            <div className="animate-rise-delay-2 mt-10">
              <Link href="/pilot" className="btn btn-primary">
                Start free pilot
              </Link>
            </div>
          </div>
        </section>

        {/* Statement */}
        <section className="border-y border-line bg-ink text-paper">
          <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 md:py-32">
            <h2 className="max-w-4xl font-serif text-4xl leading-[1.1] tracking-[-0.035em] md:text-6xl">
              Big companies run on AI.
              <span className="text-paper/45">
                {" "}
                Small businesses still run on missed calls.
              </span>
            </h2>
          </div>
        </section>

        {/* How */}
        <section className="bg-paper">
          <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 md:py-32">
            <p className="font-sans text-sm font-medium tracking-[0.18em] text-muted uppercase">
              How Orvius works
            </p>
            <h2 className="mt-5 max-w-3xl font-serif text-4xl leading-tight tracking-[-0.03em] md:text-5xl">
              From unanswered to booked.
            </h2>

            <div className="mt-16 grid gap-16 border-t border-line pt-16 md:grid-cols-3 md:gap-12">
              {[
                {
                  title: "Answers",
                  body: "Every inbound call and text — after hours, mid-job, or when no one can pick up.",
                },
                {
                  title: "Qualifies",
                  body: "Service, urgency, address, and callback — captured cleanly.",
                },
                {
                  title: "Alerts you",
                  body: "A precise owner summary with everything you need to close.",
                },
              ].map((item) => (
                <div key={item.title}>
                  <h3 className="font-serif text-3xl tracking-[-0.03em] text-ink">
                    {item.title}
                  </h3>
                  <p className="mt-4 font-serif text-lg leading-relaxed text-muted">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Product */}
        <section id="product" className="border-y border-line bg-surface/80">
          <div className="mx-auto grid max-w-6xl items-start gap-16 px-6 py-24 md:px-10 md:py-32 lg:grid-cols-2">
            <div>
              <p className="font-sans text-sm font-medium tracking-[0.18em] text-muted uppercase">
                Product
              </p>
              <h2 className="mt-5 font-serif text-4xl leading-tight tracking-[-0.03em] md:text-5xl">
                Built for the field.
              </h2>
              <p className="mt-6 max-w-md font-serif text-xl leading-relaxed text-muted">
                While you&apos;re on a job, Orvius takes the next one. You get a
                summary — not a voicemail.
              </p>
              <Link href="/demo" className="btn btn-secondary mt-10">
                Try a demo call
              </Link>
            </div>

            <div className="rounded-2xl border border-line bg-paper p-8 md:p-10">
              <p className="font-sans text-xs font-medium tracking-[0.18em] text-muted uppercase">
                Orvius · Owner alert
              </p>
              <p className="mt-5 font-serif text-3xl leading-snug tracking-[-0.02em] text-ink">
                New lead from Maria Lopez
              </p>
              <dl className="mt-8 font-serif text-lg text-muted">
                {[
                  ["Phone", "+1 512 555 0123"],
                  ["Service", "AC not cooling"],
                  ["Urgency", "Emergency"],
                  ["Address", "1842 Oak Street"],
                ].map(([label, value], i, arr) => (
                  <div
                    key={label}
                    className={`flex justify-between gap-6 py-3 ${
                      i < arr.length - 1 ? "border-b border-line" : ""
                    }`}
                  >
                    <dt>{label}</dt>
                    <dd className="text-right text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* Close */}
        <section className="bg-paper">
          <div className="mx-auto max-w-6xl px-6 py-24 md:px-10 md:py-32">
            <p className="font-serif text-[clamp(3rem,10vw,7rem)] leading-[0.9] tracking-[-0.05em] text-ink">
              Orvius
            </p>
            <h2 className="mt-8 max-w-3xl font-serif text-3xl leading-tight tracking-[-0.03em] text-ink md:text-5xl">
              First ten shops. Thirty days free.
            </h2>
            <p className="mt-6 max-w-xl font-serif text-xl leading-relaxed text-muted">
              We set it up with you. Prove it on real calls.
            </p>
            <Link href="/pilot" className="btn btn-primary mt-10">
              Apply for the pilot
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
      <ProfileMenu statusLabel="Founder workspace" />
    </>
  );
}
