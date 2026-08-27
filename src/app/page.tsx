import { SiteFooter } from "@/components/site-footer";
import { ProfileMenu } from "@/components/profile-menu";
import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line/60 bg-paper/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 md:px-8">
          <Link
            href="/"
            className="font-sans text-sm font-medium tracking-[0.14em] text-ink uppercase"
          >
            Orvius
          </Link>
          <div className="flex items-center gap-6">
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
        {/* Hero — big brand, tight composition */}
        <section className="bg-paper">
          <div className="mx-auto max-w-6xl px-6 py-14 md:px-8 md:py-16">
            <h1 className="animate-rise font-serif text-[clamp(4rem,14vw,9.5rem)] leading-[0.9] tracking-[-0.055em] text-ink">
              Orvius
            </h1>

            <div className="animate-rise-delay mt-6 grid gap-8 border-t border-line pt-6 md:grid-cols-[1.4fr_0.8fr] md:items-end md:gap-12">
              <div>
                <p className="font-serif text-2xl leading-snug tracking-[-0.02em] text-ink md:text-3xl">
                  The front door of your business — always answered.
                </p>
                <p className="mt-3 max-w-xl font-serif text-lg leading-relaxed text-muted">
                  AI operating partner for service businesses. Capture every
                  lead. Run with less friction.
                </p>
              </div>
              <div className="md:justify-self-end">
                <Link href="/pilot" className="btn btn-primary">
                  Start free pilot
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Statement */}
        <section className="border-y border-line bg-ink text-paper">
          <div className="mx-auto max-w-6xl px-6 py-14 md:px-8 md:py-16">
            <h2 className="max-w-4xl font-serif text-3xl leading-[1.15] tracking-[-0.03em] md:text-5xl">
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
          <div className="mx-auto max-w-6xl px-6 py-14 md:px-8 md:py-16">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="font-sans text-sm font-medium tracking-[0.16em] text-muted uppercase">
                  How Orvius works
                </p>
                <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em] md:text-4xl">
                  From unanswered to booked.
                </h2>
              </div>
            </div>

            <div className="mt-10 grid gap-8 border-t border-line pt-10 md:grid-cols-3 md:gap-10">
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
                  <h3 className="font-serif text-2xl tracking-[-0.02em] text-ink">
                    {item.title}
                  </h3>
                  <p className="mt-3 font-serif text-base leading-relaxed text-muted md:text-lg">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Product */}
        <section id="product" className="border-y border-line bg-surface/80">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-14 md:px-8 md:py-16 lg:grid-cols-2 lg:gap-14">
            <div>
              <p className="font-sans text-sm font-medium tracking-[0.16em] text-muted uppercase">
                Product
              </p>
              <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em] md:text-4xl">
                Built for the field.
              </h2>
              <p className="mt-4 max-w-md font-serif text-lg leading-relaxed text-muted">
                While you&apos;re on a job, Orvius takes the next one. You get a
                summary — not a voicemail.
              </p>
              <Link href="/demo" className="btn btn-secondary mt-7">
                Try a demo call
              </Link>
            </div>

            <div className="rounded-2xl border border-line bg-paper p-7 md:p-8">
              <p className="font-sans text-xs font-medium tracking-[0.18em] text-muted uppercase">
                Orvius · Owner alert
              </p>
              <p className="mt-4 font-serif text-2xl leading-snug tracking-[-0.02em] text-ink md:text-3xl">
                New lead from Maria Lopez
              </p>
              <dl className="mt-6 font-serif text-base text-muted md:text-lg">
                {[
                  ["Phone", "+1 512 555 0123"],
                  ["Service", "AC not cooling"],
                  ["Urgency", "Emergency"],
                  ["Address", "1842 Oak Street"],
                ].map(([label, value], i, arr) => (
                  <div
                    key={label}
                    className={`flex justify-between gap-6 py-2.5 ${
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
        <section className="bg-ink text-paper">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-14 md:flex-row md:items-end md:justify-between md:px-8 md:py-16">
            <div className="max-w-2xl">
              <p className="font-serif text-5xl leading-none tracking-[-0.04em] md:text-6xl">
                Orvius
              </p>
              <h2 className="mt-5 font-serif text-2xl leading-snug tracking-[-0.02em] md:text-3xl">
                First ten shops. Thirty days free.
              </h2>
              <p className="mt-3 font-serif text-lg text-paper/60">
                We set it up with you. Prove it on real calls.
              </p>
            </div>
            <Link
              href="/pilot"
              className="btn shrink-0 bg-paper text-ink hover:bg-white"
            >
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
