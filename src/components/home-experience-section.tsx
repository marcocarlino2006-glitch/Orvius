import { HomeCallDemo } from "@/components/home-call-demo";
import { RevealOnScroll } from "@/components/reveal-on-scroll";

const steps = [
  {
    step: "01",
    title: "Call the live line",
    body: "Dial Summit HVAC's demo number. Real AI. Real production stack. Not a recording.",
  },
  {
    step: "02",
    title: "Talk like a customer",
    body: "Say your AC died or you need a plumber. Orvius qualifies you — service, urgency, address.",
  },
  {
    step: "03",
    title: "See what the owner gets",
    body: "Lead in the dashboard. SMS on the owner's phone. That's your shop — in under a minute.",
  },
] as const;

export function HomeExperienceSection() {
  return (
    <section className="home-experience" aria-labelledby="experience-heading">
      <div className="editorial-wrap">
        <RevealOnScroll>
          <div className="home-experience-head">
            <p className="cursor-label font-sans">Try it in 60 seconds</p>
            <h2 id="experience-heading" className="cursor-section-title font-serif">
              Don&apos;t watch a video. Call it.
            </h2>
            <p className="cursor-body font-sans">
              Every competitor asks you to book a demo. Orvius answers the phone
              — right now — so you hear exactly what your customers will hear.
            </p>
          </div>
        </RevealOnScroll>

        <RevealOnScroll delay={80}>
          <ol className="home-experience-steps font-sans">
            {steps.map((item) => (
              <li key={item.step} className="home-experience-step">
                <span className="home-experience-step-num">{item.step}</span>
                <div>
                  <h3 className="home-experience-step-title">{item.title}</h3>
                  <p className="home-experience-step-body">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </RevealOnScroll>

        <RevealOnScroll delay={120}>
          <div className="home-experience-call">
            <HomeCallDemo variant="void" size="section" />
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}
