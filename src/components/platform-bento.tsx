import { RevealGroup, RevealOnScroll } from "@/components/reveal-on-scroll";
import { SectionEyebrow } from "@/components/owner-alert-card";
import { platformPillars } from "@/lib/company";

const flow = [
  { step: "01", label: "Answer", detail: "Every call & text" },
  { step: "02", label: "Qualify", detail: "Service · urgency · address" },
  { step: "03", label: "Alert", detail: "Owner notified instantly" },
] as const;

export function PlatformBento() {
  return (
    <section className="home-section border-t border-white/8 bg-void">
      <div className="mx-auto max-w-6xl px-6 md:px-8">
        <RevealOnScroll>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="home-section-head max-w-xl">
              <SectionEyebrow>Platform</SectionEyebrow>
              <h2 className="home-section-title mt-5 font-serif text-chalk">
                Infrastructure for the front door.
              </h2>
            </div>
            <p className="max-w-md font-sans text-[0.9375rem] leading-relaxed text-ash-soft lg:pb-1">
              Reception first — where revenue is won or lost. One intelligence
              layer that scales from a single truck to a multi-location shop.
            </p>
          </div>
        </RevealOnScroll>

        <RevealGroup className="bento-grid mt-14">
          {platformPillars.map((item, i) => (
            <article
              key={item.title}
              className={`bento-card reveal-item ${i === 0 ? "bento-card-featured" : ""}`}
            >
              <span className="bento-index font-sans">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="bento-title font-serif text-chalk">{item.title}</h3>
              <p className="bento-body font-sans text-ash-soft">{item.body}</p>
              {i === 0 ? (
                <div className="bento-glow" aria-hidden />
              ) : null}
            </article>
          ))}

          <article className="bento-card bento-card-flow reveal-item">
            <SectionEyebrow>Live loop</SectionEyebrow>
            <div className="bento-flow mt-6">
              {flow.map((item, i) => (
                <div key={item.step} className="bento-flow-step">
                  {i > 0 ? (
                    <span className="bento-flow-connector" aria-hidden />
                  ) : null}
                  <div>
                    <p className="font-sans text-[10px] font-bold tracking-[0.22em] text-flare uppercase">
                      {item.step}
                    </p>
                    <p className="mt-2 font-serif text-xl tracking-[-0.03em] text-chalk">
                      {item.label}
                    </p>
                    <p className="mt-1 font-sans text-xs text-ash-soft">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </RevealGroup>
      </div>
    </section>
  );
}
