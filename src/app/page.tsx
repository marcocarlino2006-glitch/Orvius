import { SiteFooter } from "@/components/site-footer";
import { ProfileMenu } from "@/components/profile-menu";
import Link from "next/link";

/**
 * Homepage blueprint (from category-leader study):
 * Nav → Category hero → Statement → How → Product surface → Close
 * No images. One idea per section.
 */
export default function HomePage() {
  return (
    <>
      <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5 md:px-8">
          <Link
            href="/"
            className="font-sans text-[1.05rem] font-medium tracking-tight text-ink"
          >
            Orvius
          </Link>
          <div className="flex items-center gap-7">
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
        {/* 1. Category claim — Stripe/Linear pattern */}
        <section className="bg-paper">
          <div className="mx-auto max-w-5xl px-6 pb-24 pt-16 md:px-8 md:pb-32 md:pt-24">
            <h1 className="animate-rise max-w-4xl font-serif text-5xl leading-[1.05] tracking-[-0.035em] text-ink md:text-7xl lg:text-[5.1rem]">
              The AI operating partner for service businesses.
            </h1>
            <p className="animate-rise-delay mt-8 max-w-2xl font-serif text-2xl leading-relaxed text-muted md:text-[1.75rem]">
              Every call answered. Every lead captured. Start with the
              receptionist — grow into the system that runs the business.
            </p>
            <div className="animate-rise-delay-2 mt-12 flex flex-wrap gap-3">
              <Link href="/pilot" className="btn btn-primary">
                Start free pilot
              </Link>
              <Link href="#product" className="btn btn-secondary">
                See the product
              </Link>
            </div>
          </div>
        </section>

        {/* 2. Statement — Anthropic calm */}
        <section className="border-y border-line bg-surface/70">
          <div className="mx-auto max-w-5xl px-6 py-20 md:px-8 md:py-28">
            <h2 className="max-w-4xl font-serif text-4xl leading-[1.12] tracking-[-0.03em] text-ink md:text-5xl lg:text-[3.5rem]">
              Big companies run on AI.
              <span className="text-muted">
                {" "}
                Small businesses still run on missed calls.
              </span>
            </h2>
          </div>
        </section>

        {/* 3. How — Apple one-idea clarity */}
        <section className="bg-paper">
          <div className="mx-auto max-w-5xl px-6 py-20 md:px-8 md:py-28">
            <p className="font-sans text-sm font-medium tracking-[0.16em] text-muted uppercase">
              How it works
            </p>
            <h2 className="mt-5 max-w-3xl font-serif text-4xl leading-tight tracking-[-0.03em] md:text-5xl">
              From unanswered to booked.
            </h2>

            <div className="mt-16 grid gap-14 border-t border-line pt-14 md:grid-cols-3 md:gap-12">
              {[
                {
                  title: "Orvius answers",
                  body: "Every inbound call and text — after hours, mid-job, or when no one can pick up.",
                },
                {
                  title: "Qualifies the work",
                  body: "Service type, urgency, address, and callback number — captured cleanly.",
                },
                {
                  title: "You stay in control",
                  body: "A precise owner alert with everything you need to close the job.",
                },
              ].map((item) => (
                <div key={item.title}>
                  <h3 className="font-serif text-2xl tracking-[-0.02em] text-ink md:text-3xl">
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

        {/* 4. Product surface — Linear pattern (UI as proof) */}
        <section id="product" className="border-y border-line bg-surface/70">
          <div className="mx-auto grid max-w-5xl items-start gap-16 px-6 py-20 md:px-8 md:py-28 lg:grid-cols-2">
            <div>
              <p className="font-sans text-sm font-medium tracking-[0.16em] text-muted uppercase">
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
                Owner alert
              </p>
              <p className="mt-5 font-serif text-3xl leading-snug tracking-[-0.02em] text-ink">
                New lead from Maria Lopez
              </p>
              <dl className="mt-8 space-y-0 font-serif text-lg text-muted">
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

        {/* 5. Close — institutional */}
        <section className="bg-ink text-paper">
          <div className="mx-auto max-w-5xl px-6 py-24 md:px-8 md:py-32">
            <h2 className="max-w-3xl font-serif text-4xl leading-[1.1] tracking-[-0.03em] md:text-6xl">
              First ten shops.
              <br />
              Thirty days free.
            </h2>
            <p className="mt-7 max-w-xl font-serif text-xl leading-relaxed text-paper/60">
              We set Orvius up with you. Prove it on real calls.
            </p>
            <Link
              href="/pilot"
              className="btn mt-10 bg-paper text-ink hover:bg-white"
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
