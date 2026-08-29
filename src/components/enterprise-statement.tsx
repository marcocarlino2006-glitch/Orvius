import { RevealOnScroll } from "@/components/reveal-on-scroll";

export function EnterpriseStatement() {
  return (
    <section className="statement-section relative overflow-hidden border-t border-white/8">
      <div className="statement-grid absolute inset-0" aria-hidden />
      <div className="statement-glow absolute inset-0" aria-hidden />

      <div className="relative mx-auto max-w-6xl px-6 py-24 md:px-8 md:py-32">
        <RevealOnScroll>
          <p className="eyebrow">The gap</p>
          <h2 className="statement-headline mt-8 font-serif text-chalk">
            Big operators run on{" "}
            <span className="statement-accent">intelligence</span>. Small shops
            still run on{" "}
            <span className="statement-muted">missed calls.</span>
          </h2>
          <p className="statement-sub mt-10 max-w-2xl font-sans text-[1.0625rem] leading-[1.7] text-ash-soft">
            Orvius closes that gap — enterprise-grade reception for every HVAC,
            plumbing, and electrical business. No hiring. No enterprise software
            bloat. Just the front door, handled.
          </p>
        </RevealOnScroll>
      </div>
    </section>
  );
}
